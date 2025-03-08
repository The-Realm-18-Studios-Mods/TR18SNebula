import { createHash } from 'crypto'
import { copy, mkdirs, pathExists, remove } from 'fs-extra/esm'
import { lstat, readFile } from 'fs/promises'
import { Module, Type } from 'helios-distribution-types'
import { basename, join } from 'path'
import { VersionManifestFG2 } from '../../../model/neoforge/VersionManifestFG2.js'
import { LibRepoStructure } from '../../../structure/repo/LibRepo.struct.js'
import { MavenUtil } from '../../../util/MavenUtil.js'
import { PackXZExtractWrapper } from '../../../util/java/PackXZExtractWrapper.js'
import { VersionUtil } from '../../../util/VersionUtil.js'
import { NeoForgeResolver } from '../NeoForge.resolver.js'
import { MinecraftVersion } from '../../../util/MinecraftVersion.js'
import { LoggerUtil } from '../../../util/LoggerUtil.js'

type ArrayElement<A> = A extends readonly (infer T)[] ? T : never

export class NeoForgeGradle2Adapter extends NeoForgeResolver {

    private static readonly logger = LoggerUtil.getLogger('FG2 Adapter')

    public static isForVersion(version: MinecraftVersion, libraryVersion: string): boolean {
        if(version.getMinor() === 12 && !VersionUtil.isOneDotTwelveFG2(libraryVersion)) {
            return false
        }
        return VersionUtil.isVersionAcceptable(version, [7, 8, 9, 10, 11, 12])
    }

    constructor(
        absoluteRoot: string,
        relativeRoot: string,
        baseUrl: string,
        minecraftVersion: MinecraftVersion,
        neoforgeVersion: string,
        discardOutput: boolean,
        invalidateCache: boolean
    ) {
        super(absoluteRoot, relativeRoot, baseUrl, minecraftVersion, neoforgeVersion, discardOutput, invalidateCache)
    }

    public async getModule(): Promise<Module> {
        return this.getNeoForgeByVersion()
    }

    public isForVersion(version: MinecraftVersion, libraryVersion: string): boolean {
        return NeoForgeGradle2Adapter.isForVersion(version, libraryVersion)
    }

    public async getNeoForgeByVersion(): Promise<Module> {
        const libRepo = this.repoStructure.getLibRepoStruct()
        const targetLocalPath = libRepo.getLocalNeoForge(this.artifactVersion, 'universal')
        NeoForgeGradle2Adapter.logger.debug(`Checking for neoforge version at ${targetLocalPath}..`)
        if (!await libRepo.artifactExists(targetLocalPath)) {
            NeoForgeGradle2Adapter.logger.debug('NeoForge not found locally, initializing download..')
            await libRepo.downloadArtifactByComponents(
                this.REMOTE_REPOSITORY,
                LibRepoStructure.NEOFORGE_GROUP,
                LibRepoStructure.NEOFORGE_ARTIFACT,
                this.artifactVersion, 'universal', 'jar')
        } else {
            NeoForgeGradle2Adapter.logger.debug('Using locally discovered neoforge.')
        }
        NeoForgeGradle2Adapter.logger.debug(`Beginning processing of NeoForge v${this.neoforgeVersion} (Minecraft ${this.minecraftVersion})`)

        let versionManifestBuf: Buffer
        try {
            versionManifestBuf = await this.getVersionManifestFromJar(targetLocalPath)
        } catch(err) {
            throw new Error('Failed to find version.json in neoforge universal jar.')
        }

        const versionManifest = JSON.parse(versionManifestBuf.toString()) as VersionManifestFG2

        const neoforgeModule: Module = {
            id: MavenUtil.mavenComponentsToIdentifier(
                LibRepoStructure.NEOFORGE_GROUP,
                LibRepoStructure.NEOFORGE_ARTIFACT,
                this.artifactVersion, 'universal'
            ),
            name: 'Minecraft NeoForge',
            type: Type.NeoForgeHosted,
            artifact: this.generateArtifact(
                await readFile(targetLocalPath),
                await lstat(targetLocalPath),
                libRepo.getArtifactUrlByComponents(
                    this.baseUrl,
                    LibRepoStructure.NEOFORGE_GROUP,
                    LibRepoStructure.NEOFORGE_ARTIFACT,
                    this.artifactVersion, 'universal'
                )
            ),
            subModules: []
        }

        const postProcessQueue = []

        for (const lib of versionManifest.libraries) {
            if (lib.name.startsWith('net.neoforge:neoforge:')) {
                continue
            }
            NeoForgeGradle2Adapter.logger.debug(`Processing ${lib.name}..`)

            const extension = await this.determineExtension(lib, libRepo)
            const localPath = libRepo.getArtifactById(lib.name, extension)

            const postProcess = extension === 'jar.pack.xz'

            let queueDownload = !await libRepo.artifactExists(localPath)
            let libBuf

            if (!queueDownload) {
                libBuf = await readFile(localPath)
                // VERIFY HASH
                if (!postProcess) { // Checksums for .pack.xz in the version.json are completely useless.
                    if (lib.checksums != null && lib.checksums.length == 1) {
                        const sha1 = createHash('sha1').update(libBuf).digest('hex')
                        if (sha1 !== lib.checksums[0]) {
                            NeoForgeGradle2Adapter.logger.debug('Hashes do not match, redownloading..')
                            queueDownload = true
                        }
                    }
                }
            } else {
                NeoForgeGradle2Adapter.logger.debug('Not found locally, downloading..')
                queueDownload = true
            }

            if (queueDownload) {
                await libRepo.downloadArtifactById(lib.url || this.MOJANG_REMOTE_REPOSITORY, lib.name, extension)
                libBuf = await readFile(localPath)
            } else {
                NeoForgeGradle2Adapter.logger.debug('Using local copy.')
            }

            const stats = await lstat(localPath)

            const mavenComponents = MavenUtil.getMavenComponents(lib.name)
            const properId = MavenUtil.mavenComponentsToIdentifier(
                mavenComponents.group, mavenComponents.artifact, mavenComponents.version,
                mavenComponents.classifier, extension
            )

            neoforgeModule.subModules?.push({
                id: properId,
                name: `Minecraft NeoForge (${mavenComponents?.artifact})`,
                type: Type.Library,
                artifact: this.generateArtifact(
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
                    libBuf!,
                    stats,
                    libRepo.getArtifactUrlByComponents(
                        this.baseUrl,
                        mavenComponents.group, mavenComponents.artifact,
                        mavenComponents.version, mavenComponents.classifier, extension
                    )
                )
            })

            if (postProcess) {
                postProcessQueue.push({
                    id: properId,
                    localPath
                })
            }

        }

        for (const entry of await this.processPackXZFiles(postProcessQueue)) {
            const el = neoforgeModule.subModules?.find((element) => element.id === entry.id)
            if (el != null) {
                el.artifact.MD5 = entry.MD5
            } else {
                NeoForgeGradle2Adapter.logger.error(`Error during post processing, could not update ${entry.id}`)
            }
        }

        return neoforgeModule
    }

    private async determineExtension(lib: ArrayElement<VersionManifestFG2['libraries']>, libRepo: LibRepoStructure): Promise<string> {
        if(lib.url == null) {
            return 'jar'
        }
        NeoForgeGradle2Adapter.logger.debug('Determing extension..')
        const possibleExt = [
            'jar.pack.xz',
            'jar'
        ]
        // Check locally.
        for(const ext of possibleExt) {
            const localPath = libRepo.getArtifactById(lib.name, ext)
            const exists = await libRepo.artifactExists(localPath)
            if(exists) {
                return ext
            }
        }
        // Check remote.
        for(const ext of possibleExt) {
            const exists = await libRepo.headArtifactById(this.REMOTE_REPOSITORY, lib.name, ext)
            if(exists) {
                return ext
            }
        }
        // Default to jar.
        return 'jar'
    }

    private async processPackXZFiles(
        processingQueue: {id: string, localPath: string}[]
    ): Promise<{id: string, MD5: string}[]> {

        if(processingQueue.length == 0) {
            return []
        }

        const accumulator = []

        const tempDir = this.repoStructure.getTempDirectory()

        if (await pathExists(tempDir)) {
            await remove(tempDir)
        }

        await mkdirs(tempDir)

        const files = []
        for (const entry of processingQueue) {
            const tmpFile = join(tempDir, basename(entry.localPath))
            await copy(entry.localPath, tmpFile)
            files.push(tmpFile)
        }

        NeoForgeGradle2Adapter.logger.debug('Spawning PackXZExtract.')
        const packXZExecutor = new PackXZExtractWrapper()
        await packXZExecutor.extractUnpack(files)
        NeoForgeGradle2Adapter.logger.debug('All files extracted, calculating hashes..')

        for (const entry of processingQueue) {
            const tmpFileName = basename(entry.localPath)
            const tmpFile = join(tempDir, tmpFileName.substring(0, tmpFileName.indexOf('.pack.xz')))
            const buf = await readFile(tmpFile)
            accumulator.push({
                id: entry.id,
                MD5: createHash('md5').update(buf).digest('hex')
            })
        }

        NeoForgeGradle2Adapter.logger.debug('Complete, removing temp directory..')

        await remove(tempDir)

        return accumulator
    }

}
