/// <reference types="node" />
import { EntryPoint, OAUTH2SCOPE } from './common';
import { CortexCredentialProvider } from './credentialprovider';
import { Credentials } from './credentials';
import { URL } from 'url';
/**
 * Interface that describes the object pushed by the `authCallbackHandler` method into the
 * *express.Request* property `callbackIdp` after a Cortex Hub callback handling
 */
export interface HubIdpCallback {
    /**
     * Would describe the error during the callback processing (if any)
     */
    error?: string;
    /**
     * Optional message in the response
     */
    message?: string;
    /**
     * Datalake ID if successfully processed and stored
     */
    datalakeId?: string;
}
interface HubPassportRequest<U> {
    query: {
        code: string;
        state: string;
    };
    user?: U;
    callbackIdp?: HubIdpCallback;
    [key: string]: any;
}
/**
 * Describes the `params` object provided by Cortex HUB. The `T` type must extend a string
 * dictionary and is expected to contain the *custom fields* provided by the application in the
 * manifest file
 */
export interface CortexClientParams<T extends {
    [key: string]: string;
}> {
    /**
     * Unique ID assigned by Cortex HUB to this application<->datalake combination
     */
    instance_id: string;
    /**
     * Convenient placeholder to allow applications using this SDK attach a friendly name to
     * the Instance ID
     */
    instance_name?: string;
    /**
     * Augmented `region` property provided by Cortex HUB. Use the `paramsaParser` method to generate
     * this augmentation out of the BASE64 string provided by Cortex HUB
     */
    location: {
        /**
         * Region value as provided by Cortex HUB
         */
        region: string;
        /**
         * Augmented API entry point for the provided region
         */
        entryPoint: EntryPoint;
    };
    /**
     * Serial number of the Cortex Datalake at the other end of this Instance ID
     */
    lsn?: string;
    /**
     * Optional fields requested in the application manifest file
     */
    customFields?: T;
}
/**
 * Convenience function to check if a given object conforms to the `CortexClientParams` interface
 * @param obj the object to be checked
 */
export declare function isCortexClientParams<T extends {
    [key: string]: string;
}>(obj: any): obj is CortexClientParams<T>;
/**
 * Anyone willing to extend the `CortexHubHelper` abstract class will need to implement storage
 * methods dealing with objects conforming to this interface. It describes an *authorization state*
 * (a pending authorization sent to IDP for user consent)
 */
export interface HubIdpStateData<M> {
    /**
     * Requester Tenant ID
     */
    tenantId: string;
    /**
     * Requested datalakeID
     */
    datalakeId: string;
    metadata: M;
}
/**
 * Optional configuration attributes for the `CortexHubHelper` class
 */
export interface CortexHelperOptions {
    /**
     * URL of the IDP authorization entry point (defaults to `https://identity.paloaltonetworks.com/as/authorization.oauth2`)
     */
    idpAuthUrl?: string;
    /**
     * Controls wheter the autorization callback should check the requester Tenant ID (defaults to
     * `false`)
     */
    forceCallbackTenantValidation?: boolean;
}
/**
 * Abstract class with methods to help interfacing with the Cortex HUB.
 * @param T dictionary-like extension with custom fields provided by the application in the
 * manifest file
 * @param U interface used by the `req.user` object provided by a *PassportJS-like* enabled
 * application willing to use this class `authCallbackHandler` method.
 * @param K the string-like property in `U` containing the requester TenantID
 * @param M interface describing the metadata that will be attached to datalakes in CortexCredentialProvider
 * for multi-tenancy applications. CortexHubHelper will add/replace a property named `tenantId` in M so take this into
 * consideration when defining the interface `M`
 */
export declare abstract class CortexHubHelper<T extends {
    [key: string]: string;
}, U, K extends keyof U, M> {
    private clientId;
    private clientSecret;
    private idpAuthUrl;
    private callbackTenantValidation;
    private credProvider;
    private idpCallbackUrl;
    private tenantKey?;
    static className: string;
    /**
     * Constructor method
     * @param idpCallbackUrl One of the URI's provided in the `auth_redirect_uris` field of the manifest file
     * @param credProv a `CortexCredentialProvider` instance that will be used by the `authCallbackHandler` to
     * register new datalakes after activation
     * @param tenantKey the name of the string-like property in `U` that contains the requesting Tenant ID
     * @param ops class configuration options
     */
    constructor(idpCallbackUrl: string, credProv: CortexCredentialProvider<{
        tenantId: string;
    } & M, 'tenantId'>, tenantKey?: K, ops?: CortexHelperOptions);
    /**
     * Static class method to exchange a 60 seconds OAUTH2 code for valid credentials
     * @param code OAUTH2 app 60 seconds one time `code`
     * @param redirectUri OAUTH2 app `redirect_uri` callback
     */
    private fetchTokens;
    /**
     * Prepares an IDP authorization request
     * @param tenantId Requesting Tenant ID (will be store in the authorization state)
     * @param datalakeId Datalake ID willing to activate (will be store in the authorization state)
     * @param scope OAUTH2 Data access Scope(s)
     * @returns a URI ready to be consumed (typically to be used for a client 302 redirect)
     */
    idpAuthRequest(tenantId: string, datalakeId: string, scope: OAUTH2SCOPE[], metadata: M): Promise<URL>;
    /**
     * ExpressJS handler (middleware) that deals with IDP Authentication Callback. The method
     * relies on some properties and methods of `this` so be remember to `bind()` the method
     * to the object when using it elsewhere
     * @param req `express.Request` object. If `callbackTenantValidation` was set to
     * true at class instantiation time, then the method expects a string-like field `K`
     * in the `req.user` object containing the requesting Tenant ID. A field named `callbackIdp`
     * containing a `HubIdpCallback` object with the processing result will be populated here.
     * @param next next handler in the chain that will be called under any condition
     */
    authCallbackHandler(req: HubPassportRequest<U>, resp: any, next: () => void): Promise<void>;
    /**
     * Parses the CortexHub BASE64 params string into a CortexClientParams object
     * @param queryString Input string
     */
    paramsParser(queryString: string): CortexClientParams<T>;
    /**
     * Retrieves the list of datalakes registered under this tenant
     * @param tenantId requesting Tenant ID
     */
    listDatalake(tenantId: string): Promise<({
        id: string;
        doc: CortexClientParams<T>;
    })[]>;
    /**
     * Gets metadata of a given Datalake ID as a `CortexClientParams` object
     * @param tenantId requesting Tenant ID
     * @param datalakeId ID of the Datalake
     */
    getDatalake(tenantId: string, datalakeId: string): Promise<CortexClientParams<T>>;
    /**
     * Stores datalake metadata
     * @param tenantId requesting Tenant ID
     * @param datalakeId ID of the datalake
     * @param clientParams metadata as a `CortexClientParams` object
     */
    upsertDatalake(tenantId: string, datalakeId: string, clientParams: CortexClientParams<T>): Promise<void>;
    /**
     * Deletes a datalake metadata record
     * @param tenantId requesting Tenant ID
     * @param datalakeId ID of the datalake
     */
    deleteDatalake(tenantId: string, datalakeId: string): Promise<void>;
    /**
     * Abstraction that allows the `CortexHubHelper` subclass implementation reach out its bound `CortexCredentialProvider`
     * The typical use case if for the `CortexHubHelper` to ask the `CortexCredentialProvider` the list of datalake ID's
     * it holds (activated) for a given tenant ID
     * @param tenantId
     */
    datalakeActiveList(tenantId: string): Promise<string[]>;
    getCredentialsObject(tenantId: string, datalakeId: string): Promise<Credentials>;
    protected abstract _listDatalake(tenantId: string): Promise<({
        id: string;
        doc: CortexClientParams<T>;
    })[]>;
    protected abstract _getDatalake(tenantId: string, datalakeId: string): Promise<CortexClientParams<T>>;
    protected abstract _upsertDatalake(tenantId: string, datalakeId: string, clientParams: CortexClientParams<T>): Promise<void>;
    protected abstract _deleteDatalake(tenantId: string, datalakeId: string): Promise<void>;
    protected abstract requestAuthState(stateData: HubIdpStateData<M>): Promise<string>;
    protected abstract restoreAuthState(stateId: string): Promise<HubIdpStateData<M>>;
    protected abstract deleteAuthState(stateId: string): Promise<void>;
}
export {};
