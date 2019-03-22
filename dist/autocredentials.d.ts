import { CredentialProviderOptions } from './credentialprovider';
import { DevTokenCredentialsOptions } from './devtokencredentials';
import { Credentials } from './credentials';
export declare function autoCredentials(opt?: CredentialProviderOptions & DevTokenCredentialsOptions & {
    accessToken?: string;
}): Promise<Credentials>;
