import { Credentials, CredentialsOptions } from './credentials';
export interface DevTokenCredentialsOptions extends CredentialsOptions {
    /**
     * Environmental variable containing the Developer Token string
     */
    envDevToken?: string;
    /**
     * Environmental variable containing the URI for the developer token provider
     */
    envDevTokenProvider?: string;
    /**
     * URI for the developer token provider
     */
    developerTokenProvider?: string;
    /**
     * Developer Token string
     */
    developerToken?: string;
}
export declare class DevTokenCredentials extends Credentials {
    private developerToken;
    private developerTokenProvider;
    static className: string;
    constructor(devToken: string, devTokenProvider: string, accesToken: string);
    static factory(ops?: DevTokenCredentialsOptions): Promise<Credentials>;
    private static devTokenConsume;
    refreshAccessToken(): Promise<void>;
    revokeToken(): Promise<void>;
}
