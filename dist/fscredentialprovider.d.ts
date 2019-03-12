import { Credentials } from './credentials';
import { CortexCredentialProvider, CredentialProviderOptions, CredentialsItem } from './credentialprovider';
declare class FsCredProvider extends CortexCredentialProvider {
    private key;
    private iv;
    private configFileName;
    constructor(ops: CredentialProviderOptions & {
        clientId: string;
        clientSecret: string;
    } & {
        key: ArrayBufferView;
        iv: ArrayBufferView;
        configFileName: string;
    });
    private fullSync;
    protected createCortexRefreshToken(datalakeId: string, refreshToken: string): Promise<void>;
    protected updateCortexRefreshToken(datalakeId: string, refreshToken: string): Promise<void>;
    protected deleteCortexRefreshToken(datalakeId: string): Promise<void>;
    protected retrieveCortexRefreshToken(datalakeId: string): Promise<string>;
    protected createCredentialsItem(datalakeId: string, credentialsItem: CredentialsItem): Promise<void>;
    protected updateCredentialsItem(datalakeId: string, credentialsItem: CredentialsItem): Promise<void>;
    protected deleteCredentialsItem(datalakeId: string): Promise<void>;
    private loadConfigFile;
    protected loadCredentialsDb(): Promise<{
        [dlid: string]: CredentialsItem;
    }>;
    protected credentialsObjectFactory(datalakeId: string, accTokenGuardTime: number, prefetch?: {
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
