/// <reference types="node" />
import { EntryPoint } from './common';
import { Credentials } from './credentials';
import { CortexCredentialProvider, CredentialProviderOptions, CredentialsItem } from './credentialprovider';
declare class FsCredProvider extends CortexCredentialProvider {
    private key;
    private iv;
    private configFileName;
    className: string;
    constructor(ops: CredentialProviderOptions & {
        clientId: string;
        clientSecret: string;
    } & {
        key: Buffer;
        iv: Buffer;
        configFileName: string;
    });
    private fullSync;
    protected createCredentialsItem(datalakeId: string, credentialsItem: CredentialsItem): Promise<void>;
    protected updateCredentialsItem(datalakeId: string, credentialsItem: CredentialsItem): Promise<void>;
    protected deleteCredentialsItem(datalakeId: string): Promise<void>;
    protected loadCredentialsDb(): Promise<{
        [dlid: string]: CredentialsItem;
    }>;
    protected credentialsObjectFactory(datalakeId: string, entryPoint: EntryPoint, accTokenGuardTime: number, prefetch?: {
        accessToken: string;
        validUntil: number;
    }): Promise<Credentials>;
}
/**
 * Initializes a `CortexCredentialProvider` subclass that leverages the local filesystem as storage.
 * State data will be stored in the file `PANCLOUD_CONFIG.json`
 * Gets all its configuration options either from optional properties of from environmental variables
 * @param secret encryption key that will be used to store sensible data at rest
 * @param ops.envPrefix optional environmental variables prefix. Defauls to `PAN`
 * @param ops.envClientId environmental variable that keeps the OAUTH2 `client_id` value in case it
 * is not provided explicitly. Defaults to `{ops.envPrefix}_CLIENT_ID`
 * @param ops.envClientSecret environmental variable that keeps the OAUTH2 `client_secret` value in
 * case it is not provided explicitly. Defaults to `{ops.envPrefix}_CLIENT_SECRET`
 */
export declare function fsCredentialsFactory(ops: CredentialProviderOptions & {
    envPrefix?: string;
    clientId?: string;
    clientSecret?: string;
    secret: string;
}): Promise<FsCredProvider>;
export {};
