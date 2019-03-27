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
export declare function fsCredentialsFactory(ops: CredentialProviderOptions & {
    envPrefix?: string;
    clientId?: string;
    clientSecret?: string;
    secret: string;
}): Promise<FsCredProvider>;
export {};
