import { CredentialProviderOptions } from './credentialprovider';
import { DevTokenCredentialsOptions } from './devtokencredentials';
import { Credentials } from './credentials';
import { EntryPoint } from './common';
export declare function autoCredentials(opt?: CredentialProviderOptions & DevTokenCredentialsOptions & {
    accessToken?: string;
    refreshToken?: string;
    entryPoint?: EntryPoint;
}): Promise<Credentials>;
