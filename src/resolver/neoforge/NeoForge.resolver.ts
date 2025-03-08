import StreamZip from 'node-stream-zip'
import { RepoStructure } from '../../structure/repo/Repo.struct.js'
import { BaseResolver } from '../BaseResolver.js'
import { MinecraftVersion } from '../../util/MinecraftVersion.js'
import { VersionUtil } from '../../util/VersionUtil.js'
import { LoggerUtil } from '../../util/LoggerUtil.js'

export abstract class NeoForgeResolver extends BaseResolver {

    protected readonly MOJANG_REMOTE_REPOSITORY = 'https://libraries.minecraft.net/'
    protected readonly REMOTE_REPOSITORY = 'https://maven.neoforge.net/'

    protected repoStructure: RepoStructure
    // @ts-ignore
    protected artifactVersion: string

    constructor(
        absoluteRoot: string,
        relativeRoot: string,
        baseUrl: string,
        protected minecraftVersion: MinecraftVersion,
        protected neoforgeVersion: string,
        protected discardOutput: boolean,
        protected invalidateCache: boolean
    ) {
        super(absoluteRoot, relativeRoot, baseUrl)
        this.repoStructure = new RepoStructure(absoluteRoot, relativeRoot, 'neoforge')
        this.checkSecurity()
    }

    public checkSecurity(): void {
        const major = this.minecraftVersion.getMajor()
        const minor = this.minecraftVersion.getMinor()

        // https://github.com/apache/logging-log4j2/pull/608
        // https://github.com/advisories/GHSA-jfh8-c2jp-5v3q
        // https://www.minecraft.net/en-us/article/important-message--security-vulnerability-java-edition
        // https://twitter.com/gigaherz/status/1469331288368861195
        // https://gist.github.com/TheCurle/f15a6b63ceee3be58bff5e7a97c3a4e6

        const patchMatrix: { [major: number]: string } = {
            21: '21.1.123',
            20: '47.1.106'
        }

        const isVulnerable = major == 1 && (minor <= 18 && minor >= 12)
        const hasPatch = major == 1 && minor >= 12
        let unsafe

        if(isVulnerable) {
            if(hasPatch) {
                unsafe = !VersionUtil.versionGte(this.neoforgeVersion, patchMatrix[minor])
            } else {
                unsafe = true
            }
        }

        if(unsafe) {

            const logger = LoggerUtil.getLogger('NeoForgeSecurity')

            logger.error('==================================================================')
            logger.error('                           WARNING                                ')
            logger.error(' This version of NeoForge is vulnerable to a CRITICAL RCE exploit. ')
            logger.error('                    DO NOT USE THIS VERSION!                      ')
            if(hasPatch) {
                logger.error(`   A patch is available as of Minecraft NeoForge v${patchMatrix[minor]}      `)
            }
            else {
                logger.error('         There is no patch available for this version.            ')
            }
            logger.error('==================================================================')

            logger.error('To abort, use CTRL + C.')
            logger.error('Nebula will proceed in 15 seconds..')
            const target = new Date().getTime() + (15*1000)
            while(new Date().getTime() <= target) {
                // Wait
            }

        }

    }

    protected async getVersionManifestFromJar(jarPath: string): Promise<Buffer>{
        return new Promise((resolve, reject) => {
            const zip = new StreamZip({
                file: jarPath,
                storeEntries: true
            })
            zip.on('ready', () => {
                try {
                    const data = zip.entryDataSync('version.json')
                    zip.close()
                    resolve(data)
                } catch(err) {
                    reject(err)
                }

            })
            zip.on('error', err => reject(err))
        })
    }

}
