import { Credentials } from './credentials';
import { EntryPoint } from './common';
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
    entryPoint?: EntryPoint;
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
