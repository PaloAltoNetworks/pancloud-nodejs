import { FileCredentials, FileCredentialsOptions, EnvCredentials, EnvCredentialsOptions } from './oa2credentials'
import { DevTokenCredentialsOptions, DevTokenCredentials } from './devtokencredentials'
import { Credentials } from './credentials';
import { commonLogger } from './common'
import { PanCloudError } from './error'


export async function autoCredentials(opt?: FileCredentialsOptions | EnvCredentialsOptions | DevTokenCredentialsOptions): Promise<Credentials> {
    try {
        return await EnvCredentials.factory(opt)
    } catch (e) {
        commonLogger.info({ className: 'AutoCredentials' }, `Failed to instantiate EnvCredentials class with message ${(e as Error).message}`)
    }
    try {
        return await FileCredentials.factory(opt)
    } catch (e) {
        commonLogger.info({ className: 'AutoCredentials' }, `Failed to instantiate FileCredentials class with message ${(e as Error).message}`)
    }
    try {
        return await DevTokenCredentials.factory(opt)
    } catch (e) {
        commonLogger.info({ className: 'AutoCredentials' }, `Failed to instantiate DevTokenCredentials class with message ${(e as Error).message}`)
    }
    throw new PanCloudError({ className: 'AutoCredentials' }, 'PARSER', 'Unable to instantiate a Credentials class')
}