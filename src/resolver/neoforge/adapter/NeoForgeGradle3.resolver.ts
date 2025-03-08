import { NeoForgeResolver } from '../NeoForge.resolver.js'
import { MinecraftVersion } from '../../../util/MinecraftVersion.js'
import { LoggerUtil } from '../../../util/LoggerUtil.js'
import { VersionUtil } from '../../../util/VersionUtil.js'
import { Module, Type } from 'helios-distribution-types'
import { LibRepoStructure } from '../../../structure/repo/LibRepo.struct.js'
import { pathExists, remove, mkdirs, copy, writeJson } from 'fs-extra/esm'
import { lstat, readFile, writeFile } from 'fs/promises'
import { join, basename, dirname } from 'path'
import { spawn } from 'child_process'
import { JavaUtil } from '../../../util/java/JavaUtil.js'
import { VersionManifestFG3 } from '../../../model/forge/VersionManifestFG3.js'
import { MavenUtil } from '../../../util/MavenUtil.js'
import { createHash } from 'crypto'

interface GeneratedFile {
    name: string
    group: string
    artifact: string
    version: string
    classifiers: string[] | [undefined]
    skipIfNotPresent?: boolean
    classpath?: boolean
}

export class NeoForgeGradle3Adapter extends NeoForgeResolver {

    private static readonly logger = LoggerUtil.getLogger('FG3 Adapter')

    private static readonly WILDCARD_MCP_VERSION = '${mcpVersion}'

    public static isForVersion(version: MinecraftVersion, libraryVersion: string): boolean {
        if(version.getMinor() === 12 && VersionUtil.isOneDotTwelveFG2(libraryVersion)) {
            return false
        }
        return VersionUtil.isVersionAcceptable(version, [12, 13, 14, 15, 16, 17, 18, 19, 20, 21])
    }

    public static isExecutableJar(version: MinecraftVersion): boolean {
        return version.isGreaterThanOrEqualTo(new MinecraftVersion('1.20.3'))
    }

    private generatedFiles: GeneratedFile[] | undefined
    private wildcardsInUse: string[] | undefined

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
        this.configure()
    }

    private configure(): void {

        if(NeoForgeGradle3Adapter.isExecutableJar(this.minecraftVersion)) {

            // Separate block for 1.20.4+

            this.generatedFiles = [
                {
                    name: 'universal jar',
                    group: LibRepoStructure.NEOFORGE_GROUP,
                    artifact: LibRepoStructure.NEOFORGE_ARTIFACT,
                    version: this.artifactVersion,
                    classifiers: ['universal'],
                },
                {
                    name: 'client jar',
                    group: LibRepoStructure.NEOFORGE_GROUP,
                    artifact: LibRepoStructure.NEOFORGE_ARTIFACT,
                    version: this.artifactVersion,
                    classifiers: ['client']
                },
                {
                    name: 'client shim',
                    group: LibRepoStructure.NEOFORGE_GROUP,
                    artifact: LibRepoStructure.NEOFORGE_ARTIFACT,
                    version: this.artifactVersion,
                    classifiers: ['shim'],
                    classpath: false
                },
                {
                    name: 'fmlcore',
                    group: LibRepoStructure.NEOFORGE_GROUP,
                    artifact: LibRepoStructure.NEOFMLCORE_ARTIFACT,
                    version: this.artifactVersion,
                    classifiers: [undefined]
                },
                {
                    name: 'javafmllanguage',
                    group: LibRepoStructure.NEOFORGE_GROUP,
                    artifact: LibRepoStructure.JAVAFMLLANGUAGE_ARTIFACT,
                    version: this.artifactVersion,
                    classifiers: [undefined]
                },
                {
                    name: 'mclanguage',
                    group: LibRepoStructure.NEOFORGE_GROUP,
                    artifact: LibRepoStructure.MCLANGUAGE_ARTIFACT,
                    version: this.artifactVersion,
                    classifiers: [undefined]
                },
                {
                    name: 'lowcodelanguage',
                    group: LibRepoStructure.NEOFORGE_GROUP,
                    artifact: LibRepoStructure.LOWCODELANGUAGE_ARTIFACT,
                    version: this.artifactVersion,
                    classifiers: [undefined]
                }
            ]

            return
        }

        if(VersionUtil.isVersionAcceptable(this.minecraftVersion, [19, 20])) {

            const mcpUnifiedVersion = `${this.minecraftVersion}-${NeoForgeGradle3Adapter.WILDCARD_MCP_VERSION}`

            this.generatedFiles = [
                {
                    name: 'universal jar',
                    group: LibRepoStructure.NEOFORGE_GROUP,
                    artifact: LibRepoStructure.NEOFORGE_ARTIFACT,
                    version: this.artifactVersion,
                    classifiers: ['universal'],
                    classpath: false
                },
                {
                    name: 'client jar',
                    group: LibRepoStructure.NEOFORGE_GROUP,
                    artifact: LibRepoStructure.NEOFORGE_ARTIFACT,
                    version: this.artifactVersion,
                    classifiers: ['client'],
                    classpath: false
                },
                {
                    name: 'client data',
                    group: LibRepoStructure.MINECRAFT_GROUP,
                    artifact: LibRepoStructure.MINECRAFT_CLIENT_ARTIFACT,
                    version: this.minecraftVersion.toString(),
                    classifiers: ['data'],
                    skipIfNotPresent: true,
                    classpath: false
                },
                {
                    name: 'client srg',
                    group: LibRepoStructure.MINECRAFT_GROUP,
                    artifact: LibRepoStructure.MINECRAFT_CLIENT_ARTIFACT,
                    version: mcpUnifiedVersion,
                    classifiers: ['srg'],
                    classpath: false
                }
            ]
            this.wildcardsInUse = [
                NeoForgeGradle3Adapter.WILDCARD_MCP_VERSION
            ]

            if(VersionUtil.isVersionAcceptable(this.minecraftVersion, [17, 18, 19, 20])) {

                // Added in 1.17+

                this.generatedFiles.unshift(
                    {
                        name: 'fmlcore',
                        group: LibRepoStructure.NEOFORGE_GROUP,
                        artifact: LibRepoStructure.FMLCORE_ARTIFACT,
                        version: this.artifactVersion,
                        classifiers: [undefined]
                    },
                    {
                        name: 'javafmllanguage',
                        group: LibRepoStructure.NEOFORGE_GROUP,
                        artifact: LibRepoStructure.JAVAFMLLANGUAGE_ARTIFACT,
                        version: this.artifactVersion,
                        classifiers: [undefined]
                    },
                    {
                        name: 'mclanguage',
                        group: LibRepoStructure.NEOFORGE_GROUP,
                        artifact: LibRepoStructure.MCLANGUAGE_ARTIFACT,
                        version: this.artifactVersion,
                        classifiers: [undefined]
                    }
                )
            }

            if (VersionUtil.isVersionAcceptable(this.minecraftVersion, [18, 19, 20])) {

                // Added in 1.18+

                this.generatedFiles.unshift(
                    {
                        name: 'lowcodelanguage',
                        group: LibRepoStructure.NEOFORGE_GROUP,
                        artifact: LibRepoStructure.LOWCODELANGUAGE_ARTIFACT,
                        version: this.artifactVersion,
                        classifiers: [undefined]
                    }
                )
            } else {

                // 16+ uses the mcp unified version.

                this.generatedFiles.push(
                    {
                        name: 'client slim',
                        group: LibRepoStructure.MINECRAFT_GROUP,
                        artifact: LibRepoStructure.MINECRAFT_CLIENT_ARTIFACT,
                        version: mcpUnifiedVersion,
                        classifiers: [
                            'slim',
                            'slim-stable'
                        ],
                        classpath: false
                    },
                    {
                        name: 'client extra',
                        group: LibRepoStructure.MINECRAFT_GROUP,
                        artifact: LibRepoStructure.MINECRAFT_CLIENT_ARTIFACT,
                        version: mcpUnifiedVersion,
                        classifiers: [
                            'extra',
                            'extra-stable'
                        ],
                        classpath: false
                    }
                )

            }


            return
        }
    }

    public async getModule(): Promise<Module> {
        return this.process()
    }

    public isForVersion(version: MinecraftVersion, libraryVersion: string): boolean {
        return NeoForgeGradle3Adapter.isForVersion(version, libraryVersion)
    }

    private async process(): Promise<Module> {
        const libRepo = this.repoStructure.getLibRepoStruct()

        // Get Installer
        const installerPath = libRepo.getLocalNeoForge(this.artifactVersion, 'installer')
        NeoForgeGradle3Adapter.logger.debug(`Checking for neoforge installer at ${installerPath}..`)
        if (!await libRepo.artifactExists(installerPath)) {
            NeoForgeGradle3Adapter.logger.debug('NeoForge installer not found locally, initializing download..')
            await libRepo.downloadArtifactByComponents(
                this.REMOTE_REPOSITORY,
                LibRepoStructure.NEOFORGE_GROUP,
                LibRepoStructure.NEOFORGE_ARTIFACT,
                this.artifactVersion, 'installer', 'jar'
            )
        } else {
            NeoForgeGradle3Adapter.logger.debug('Using locally discovered neoforge installer.')
        }
        NeoForgeGradle3Adapter.logger.debug(`Beginning processing of NeoForge v${this.neoforgeVersion} (Minecraft ${this.minecraftVersion})`)

        if(this.generatedFiles != null && this.generatedFiles.length > 0) {
            // Run installer
            return this.processWithInstaller(installerPath)
        } else {
            // Installer not required
            return this.processWithoutInstaller(installerPath)
        }

    }

    private async processWithInstaller(installerPath: string): Promise<Module> {

        let doInstall = true
        // Check cache.
        const cacheDir = this.repoStructure.getNeoForgeCacheDirectory(this.artifactVersion)
        if (await pathExists(cacheDir)) {
            if(this.invalidateCache) {
                NeoForgeGradle3Adapter.logger.info(`Removing existing cache ${cacheDir}..`)
                await remove(cacheDir)
            } else {
                // Use cache.
                doInstall = false
                NeoForgeGradle3Adapter.logger.info(`Using cached results at ${cacheDir}.`)
            }
        } else {
            await mkdirs(cacheDir)
        }
        const installerOutputDir = cacheDir

        if(doInstall) {
            const workingInstaller = join(installerOutputDir, basename(installerPath))

            await copy(installerPath, workingInstaller)

            // Required for the installer to function.
            await writeFile(join(installerOutputDir, 'launcher_profiles.json'), JSON.stringify({}))

            NeoForgeGradle3Adapter.logger.debug('Spawning neoforge installer')

            NeoForgeGradle3Adapter.logger.info('============== [ IMPORTANT ] ==============')
            NeoForgeGradle3Adapter.logger.info('When the installer opens please set the client installation directory to:')
            NeoForgeGradle3Adapter.logger.info(installerOutputDir)
            NeoForgeGradle3Adapter.logger.info('===========================================')

            await this.executeInstaller(workingInstaller)

            NeoForgeGradle3Adapter.logger.debug('Installer finished, beginning processing..')
        }

        await this.verifyInstallerRan(installerOutputDir)

        NeoForgeGradle3Adapter.logger.debug('Processing Version Manifest')
        const versionManifestTuple = await this.processVersionManifest(installerOutputDir)
        const versionManifest = versionManifestTuple[0]

        NeoForgeGradle3Adapter.logger.debug('Processing generated neoforge files.')
        const neoforgeModule = await this.processNeoForgeModule(versionManifest, installerOutputDir)

        // Attach version.json module.
        neoforgeModule.subModules?.unshift(versionManifestTuple[1])

        NeoForgeGradle3Adapter.logger.debug('Processing Libraries')
        const libs = await this.processLibraries(versionManifest, installerOutputDir)

        neoforgeModule.subModules = neoforgeModule.subModules?.concat(libs)

        if(this.discardOutput) {
            NeoForgeGradle3Adapter.logger.info(`Removing installer output at ${installerOutputDir}..`)
            await remove(installerOutputDir)
            NeoForgeGradle3Adapter.logger.info('Removed successfully.')
        }

        return neoforgeModule

    }

    private getVersionManifestPath(installerOutputDir: string): string {
        const versionRepo = this.repoStructure.getVersionRepoStruct()
        const versionName = versionRepo.getFileName(this.minecraftVersion, this.neoforgeVersion)
        return join(installerOutputDir, 'versions', versionName, `${versionName}.json`)
    }

    private async verifyInstallerRan(installerOutputDir: string): Promise<void> {
        const versionManifestPath = this.getVersionManifestPath(installerOutputDir)

        if(!await pathExists(versionManifestPath)) {
            await remove(installerOutputDir)
            throw new Error(`NeoForge was either not installed or installed to the wrong location. When the neoforge installer opens, you MUST set the installation directory to ${installerOutputDir}`)
        }
    }

    private async processVersionManifest(installerOutputDir: string): Promise<[VersionManifestFG3, Module]> {
        const versionRepo = this.repoStructure.getVersionRepoStruct()
        const versionManifestPath = this.getVersionManifestPath(installerOutputDir)

        const versionManifestBuf = await readFile(versionManifestPath)
        const versionManifest = JSON.parse(versionManifestBuf.toString()) as VersionManifestFG3

        const versionManifestModule: Module = {
            id: this.artifactVersion,
            name: 'Minecraft NeoForge (version.json)',
            type: Type.VersionManifest,
            artifact: this.generateArtifact(
                versionManifestBuf,
                await lstat(versionManifestPath),
                versionRepo.getVersionManifestURL(this.baseUrl, this.minecraftVersion, this.neoforgeVersion)
            )
        }

        const destination = versionRepo.getVersionManifest(
            this.minecraftVersion,
            this.neoforgeVersion
        )

        await copy(versionManifestPath, destination, {overwrite: true})

        return [versionManifest, versionManifestModule]
    }

    private async processNeoForgeModule(versionManifest: VersionManifestFG3, installerOutputDir: string): Promise<Module> {

        const libDir = join(installerOutputDir, 'libraries')

        if(this.wildcardsInUse) {
            if(this.wildcardsInUse.includes(NeoForgeGradle3Adapter.WILDCARD_MCP_VERSION)) {

                const mcpVersion = this.getMCPVersion(versionManifest.arguments.game)
                if(mcpVersion == null) {
                    throw new Error('MCP Version not found.. did neoforge change their format?')
                }

                this.generatedFiles = this.generatedFiles!.map(f => {
                    if(f.version.includes(NeoForgeGradle3Adapter.WILDCARD_MCP_VERSION)) {
                        return {
                            ...f,
                            version: f.version.replace(NeoForgeGradle3Adapter.WILDCARD_MCP_VERSION, mcpVersion)
                        }
                    }
                    return f
                })

            }
        }

        const mdls: Module[] = []

        for (const entry of this.generatedFiles!) {

            const targetLocations: string[] = []
            let located = false

            classifierLoop:
            for (const _classifier of entry.classifiers) {

                const targetLocalPath = join(
                    libDir,
                    MavenUtil.mavenComponentsAsNormalizedPath(entry.group, entry.artifact, entry.version, _classifier)
                )

                targetLocations.push(targetLocalPath)

                const exists = await pathExists(targetLocalPath)
                if (exists) {

                    mdls.push({
                        id: MavenUtil.mavenComponentsToIdentifier(
                            entry.group,
                            entry.artifact,
                            entry.version,
                            _classifier
                        ),
                        name: `Minecraft NeoForge (${entry.name})`,
                        type: Type.Library,
                        classpath: entry.classpath ?? true,
                        artifact: this.generateArtifact(
                            await readFile(targetLocalPath),
                            await lstat(targetLocalPath),
                            this.repoStructure.getLibRepoStruct().getArtifactUrlByComponents(
                                this.baseUrl,
                                entry.group,
                                entry.artifact,
                                entry.version,
                                _classifier
                            )
                        ),
                        subModules: []
                    })

                    const destination = this.repoStructure.getLibRepoStruct().getArtifactByComponents(
                        entry.group,
                        entry.artifact,
                        entry.version,
                        _classifier
                    )

                    await copy(targetLocalPath, destination, {overwrite: true})

                    located = true
                    break classifierLoop

                }

            }

            if (!entry.skipIfNotPresent && !located) {
                throw new Error(`Required file ${entry.name} not found at any expected location:\n\t${targetLocations.join('\n\t')}`)
            }

        }

        const neoforgeModule = mdls.shift()!
        neoforgeModule.type = Type.NeoForgeHosted
        neoforgeModule.subModules = mdls

        return neoforgeModule
    }

    private async processLibraries(manifest: VersionManifestFG3, installerOutputDir: string): Promise<Module[]> {

        const libDir = join(installerOutputDir, 'libraries')
        const libRepo = this.repoStructure.getLibRepoStruct()

        const mdls: Module[] = []

        for (const entry of manifest.libraries) {
            const artifact = entry.downloads.artifact
            if (artifact.url) {

                const targetLocalPath = join(libDir, artifact.path)

                if (!await pathExists(targetLocalPath)) {
                    throw new Error(`Expected library ${entry.name} not found!`)
                }

                const components = MavenUtil.getMavenComponents(entry.name)

                mdls.push({
                    id: entry.name,
                    name: `Minecraft NeoForge (${components.artifact})`,
                    type: Type.Library,
                    artifact: this.generateArtifact(
                        await readFile(targetLocalPath),
                        await lstat(targetLocalPath),
                        libRepo.getArtifactUrlByComponents(
                            this.baseUrl,
                            components.group,
                            components.artifact,
                            components.version,
                            components.classifier,
                            components.extension
                        )
                    )
                })
                const destination = libRepo.getArtifactByComponents(
                    components.group,
                    components.artifact,
                    components.version,
                    components.classifier,
                    components.extension
                )

                await copy(targetLocalPath, destination, {overwrite: true})

            }
        }

        return mdls

    }

    private executeInstaller(installerExec: string): Promise<void> {
        return new Promise(resolve => {
            const fiLogger = LoggerUtil.getLogger('NeoForge Installer')
            const child = spawn(JavaUtil.getJavaExecutable(), [
                '-jar',
                installerExec
            ], {
                cwd: dirname(installerExec)
            })
            child.stdout.on('data', (data) => fiLogger.info(data.toString('utf8').trim()))
            child.stderr.on('data', (data) => fiLogger.error(data.toString('utf8').trim()))
            child.on('close', code => {
                if(code === 0) {
                    fiLogger.info('Exited with code', code)
                } else {
                    fiLogger.error('Exited with code', code)
                }

                resolve()
            })
        })
    }

    private getMCPVersion(args: string[]): string | null {
        for (let i = 0; i < args.length; i++) {
            if (args[i] === '--fml.mcpVersion') {
                return args[i + 1]
            }
        }
        return null
    }

    private async processWithoutInstaller(installerPath: string): Promise<Module> {

        // Extract version.json from installer.

        let versionManifestBuf: Buffer
        try {
            versionManifestBuf = await this.getVersionManifestFromJar(installerPath)
        } catch(err) {
            throw new Error('Failed to find version.json in neoforge installer jar.')
        }

        const versionManifest = JSON.parse(versionManifestBuf.toString()) as VersionManifestFG3

        // Save Version Manifest
        const versionManifestDest = this.repoStructure.getVersionRepoStruct().getVersionManifest(
            this.minecraftVersion,
            this.neoforgeVersion
        )
        await mkdirs(dirname(versionManifestDest))
        await writeJson(versionManifestDest, versionManifest, { spaces: 4 })

        const libRepo = this.repoStructure.getLibRepoStruct()
        const universalLocalPath = libRepo.getLocalNeoForge(this.artifactVersion, 'universal')
        NeoForgeGradle3Adapter.logger.debug(`Checking for NeoForge Universal jar at ${universalLocalPath}..`)

        const neoforgeMdl = versionManifest.libraries.find(val => val.name.startsWith('net.neoforge.maven:neoforge:'))

        if(neoforgeMdl == null) {
            throw new Error('NeoForge entry not found in version.json!')
        }

        let neoforgeUniversalBuffer

        // Check for local universal jar.
        if (await libRepo.artifactExists(universalLocalPath)) {
            const localUniBuf = await readFile(universalLocalPath)
            const sha1 = createHash('sha1').update(localUniBuf).digest('hex')
            if(sha1 !== neoforgeMdl.downloads.artifact.sha1) {
                NeoForgeGradle3Adapter.logger.debug('SHA-1 of local universal jar does not match version.json entry.')
                NeoForgeGradle3Adapter.logger.debug('Redownloading NeoForge Universal jar..')
            } else {
                NeoForgeGradle3Adapter.logger.debug('Using locally discovered neoforge.')
                neoforgeUniversalBuffer = localUniBuf
            }
        } else {
            NeoForgeGradle3Adapter.logger.debug('NeoForge Universal jar not found locally, initializing download..')
        }

        // Download if local is missing or corrupt
        if(!neoforgeUniversalBuffer) {
            await libRepo.downloadArtifactByComponents(
                this.REMOTE_REPOSITORY,
                LibRepoStructure.NEOFORGE_GROUP,
                LibRepoStructure.NEOFORGE_ARTIFACT,
                this.artifactVersion, 'universal', 'jar')
            neoforgeUniversalBuffer = await readFile(universalLocalPath)
        }

        NeoForgeGradle3Adapter.logger.debug(`Beginning processing of NeoForge v${this.neoforgeVersion} (Minecraft ${this.minecraftVersion})`)

        const neoforgeModule: Module = {
            id: MavenUtil.mavenComponentsToIdentifier(
                LibRepoStructure.NEOFORGE_GROUP,
                LibRepoStructure.NEOFORGE_ARTIFACT,
                this.artifactVersion, 'universal'
            ),
            name: 'Minecraft NeoForge',
            type: Type.NeoForgeHosted,
            artifact: this.generateArtifact(
                neoforgeUniversalBuffer,
                await lstat(universalLocalPath),
                libRepo.getArtifactUrlByComponents(
                    this.baseUrl,
                    LibRepoStructure.NEOFORGE_GROUP,
                    LibRepoStructure.NEOFORGE_ARTIFACT,
                    this.artifactVersion, 'universal'
                )
            ),
            subModules: []
        }

        // Attach Version Manifest module.
        neoforgeModule.subModules?.push({
            id: this.artifactVersion,
            name: 'Minecraft NeoForge (version.json)',
            type: Type.VersionManifest,
            artifact: this.generateArtifact(
                await readFile(versionManifestDest),
                await lstat(versionManifestDest),
                this.repoStructure.getVersionRepoStruct().getVersionManifestURL(
                    this.baseUrl, this.minecraftVersion, this.neoforgeVersion)
            )
        })

        for(const lib of versionManifest.libraries) {
            if (lib.name.startsWith('net.neoforge.maven:neo:')) {
                continue
            }
            NeoForgeGradle3Adapter.logger.debug(`Processing ${lib.name}..`)

            const extension = 'jar'
            const localPath = libRepo.getArtifactById(lib.name, extension)

            let queueDownload = !await libRepo.artifactExists(localPath)
            let libBuf

            if (!queueDownload) {
                libBuf = await readFile(localPath)
                const sha1 = createHash('sha1').update(libBuf).digest('hex')
                if (sha1 !== lib.downloads.artifact.sha1) {
                    NeoForgeGradle3Adapter.logger.debug('Hashes do not match, redownloading..')
                    queueDownload = true
                }
            } else {
                NeoForgeGradle3Adapter.logger.debug('Not found locally, downloading..')
                queueDownload = true
            }

            if (queueDownload) {
                await libRepo.downloadArtifactDirect(lib.downloads.artifact.url, lib.downloads.artifact.path)
                libBuf = await readFile(localPath)
            } else {
                NeoForgeGradle3Adapter.logger.debug('Using local copy.')
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

        }

        return neoforgeModule

    }

}