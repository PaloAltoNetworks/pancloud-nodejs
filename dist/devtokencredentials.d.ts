import { Credentials } from './credentials';
export interface DevTokenCredentialsOptions {
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
    guardTime?: number;
}
export declare class DevTokenCredentials extends Credentials {
    private developerToken;
    private developerTokenProvider;
    static className: string;
    constructor(ops?: DevTokenCredentialsOptions);
    private static devTokenConsume;
    retrieveAccessToken(): Promise<void>;
}
