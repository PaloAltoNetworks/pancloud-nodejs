import { defaultCredentialsFactory, CredentialProviderOptions } from './credentialprovider'
import { DevTokenCredentialsOptions, DevTokenCredentials } from './devtokencredentials'
import { Credentials } from './credentials';
import { commonLogger } from './common'
import { PanCloudError } from './error'

export async function autoCredentials(opt?: CredentialProviderOptions & DevTokenCredentialsOptions): Promise<Credentials> {
    try {
        return await defaultCredentialsFactory(opt)
    }
    catch (e) {
        commonLogger.info({ className: 'AutoCredentials' }, `Failed to instantiate Default Credential class with message ${(e as Error).message}`)
    }
    try {
        let devTokCredentias: Credentials = new DevTokenCredentials(opt)
        await devTokCredentias.retrieveAccessToken()
        return devTokCredentias
    } catch (e) {
        commonLogger.info({ className: 'AutoCredentials' }, `Failed to instantiate DevTokenCredentials class with message ${(e as Error).message}`)
    }
    throw new PanCloudError({ className: 'AutoCredentials' }, 'PARSER', 'Unable to instantiate a Credentials class')
}