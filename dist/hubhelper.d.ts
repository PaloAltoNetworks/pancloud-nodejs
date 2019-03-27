import { EntryPoint, OAUTH2SCOPE } from './common';
import { CortexCredentialProvider } from './credentialprovider';
import { URL } from 'url';
import * as express from 'express';
export interface CortexClientParams<T> {
    instance_id: string;
    instance_name?: string;
    location: {
        region: string;
        entryPoint: EntryPoint;
    };
    lsn?: string;
    customFields?: T;
}
export interface CortexHelperOptions {
    idpAuthUrl?: string;
}
export declare abstract class CortexHubHelper<T> {
    private clientId;
    private clientSecret;
    private idpAuthUrl;
    private credProvider;
    protected idpCallbackUrl: string;
    static className: string;
    constructor(idpCallbackUrl: string, credProv: CortexCredentialProvider, ops?: CortexHelperOptions);
    /**
     * Static class method to exchange a 60 seconds OAUTH2 code for valid credentials
     * @param code OAUTH2 app 60 seconds one time `code`
     * @param redirectUri OAUTH2 app `redirect_uri` callback
     */
    private fetchTokens;
    idpAuthRequest(tenantId: string, datalakeId: string, scope: OAUTH2SCOPE[]): Promise<URL>;
    authCallbackHandler(req: express.Request, resp: express.Response, redirectUri: URL, validateTenant?: (req: express.Request, tenantId: string) => boolean): Promise<void>;
    paramsParser(queryString: string): CortexClientParams<T>;
    protected abstract listDatalake(tenantId: string): Promise<{
        datalakeId: string;
        clientParams: CortexClientParams<T>;
    }[]>;
    protected abstract upsertDatalake(tenantId: string, datalakeId: string, clientParams: CortexClientParams<T>): Promise<void>;
    protected abstract getDatalake(tenantId: string, datalakeId: string): Promise<CortexClientParams<T>>;
    protected abstract deleteDatalake(tenantId: string, datalakeId: string): Promise<void>;
    protected abstract requestAuthState(tenantId: string, datalakeId: string): Promise<string>;
    protected abstract restoreAuthState(state: string): Promise<{
        tenantId: string;
        datalakeId: string;
    }>;
    protected abstract deleteAuthState(state: string): Promise<void>;
}
