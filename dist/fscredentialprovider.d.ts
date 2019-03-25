import { EntryPoint } from './common';
import { Credentials } from './credentials';
import { CortexCredentialProvider, CredentialProviderOptions, CredentialsItem, CortexClientParams } from './credentialprovider';
declare class FsCredProvider<T> extends CortexCredentialProvider<T> {
    private key;
    private iv;
    private configFileName;
    private seqno;
    private authRequests;
    className: string;
    constructor(ops: CredentialProviderOptions & {
        clientId: string;
        clientSecret: string;
    } & {
        key: ArrayBufferView;
        iv: ArrayBufferView;
        configFileName: string;
    });
    private fullSync;
    protected createCredentialsItem(datalakeId: string, credentialsItem: CredentialsItem): Promise<void>;
    protected updateCredentialsItem(datalakeId: string, credentialsItem: CredentialsItem): Promise<void>;
    protected deleteCredentialsItem(datalakeId: string): Promise<void>;
    protected loadCredentialsDb(): Promise<{
        [dlid: string]: CredentialsItem;
    }>;
    protected requestAuthState(datalakeId: string, clientParams: CortexClientParams<T>): Promise<string>;
    protected restoreAuthState(state: string): Promise<{
        datalakeId: string;
        clientParams: CortexClientParams<T>;
    }>;
    protected deleteAuthState(state: string): Promise<void>;
    protected credentialsObjectFactory(datalakeId: string, entryPoint: EntryPoint, accTokenGuardTime: number, prefetch?: {
        accessToken: string;
        validUntil: number;
    }): Promise<Credentials>;
}
export declare function fsCredentialsFactory<T>(ops: CredentialProviderOptions & {
    envPrefix?: string;
    clientId?: string;
    clientSecret?: string;
    secret: string;
}): Promise<FsCredProvider<T>>;
export {};
