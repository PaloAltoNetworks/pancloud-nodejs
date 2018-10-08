import fetch from 'node-fetch';

// This interface represents AppFramework token data
export interface appFrameworkTokens {
    accessToken?: string, // access token
    refreshToken?: string, // refresh token
}

// constant URLs, can be overridden

const IDP_TOKEN_URL: string = 'https://api.paloaltonetworks.com/api/oauth2/RequestToken'
const IDP_REVOKE_URL: string = 'https://api.paloaltonetworks.com/api/oauth2/RevokeToken'
const IDP_BASE_URL: string = 'https://identity.paloaltonetworks.com/as/authorization.oauth2'


export class Credentials {
    private access_token: string
    private refresh_token: string
    private client_id: string
    private client_secret: string
    private idp_token_url: string
    private code: string
    // TODO: region, instance_id, redirect_uri, scope, token_revoke_url, base_url, etc

    constructor(client_id: string, client_secret: string, refresh_token?: string, code?: string, idp_token_url?: string) {
        if(!refresh_token && !code) throw(`PanCloudError() Invalid Credentials (code or refresh token missing)`)
        this.client_id = client_id
        this.client_secret = client_secret
        this.refresh_token = refresh_token || undefined
        this.idp_token_url = idp_token_url || IDP_TOKEN_URL
        this.code = code || undefined
        //console.log('this idp =', this.idp_token_url)
    }

    public get_access_token(): string {
        return this.access_token;
    }

    // version 3.0 with async/await
    public async fetch_tokens(): Promise<appFrameworkTokens> {
        let res = await fetch(this.idp_token_url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'   
            },
            body: JSON.stringify({
                "client_id": this.client_id,
                "client_secret": this.client_secret,
                "refresh_token": this.refresh_token || undefined,
                "code": this.code || undefined
            })
        })
        // console.log('debug:', JSON.stringify({
        //     "client_id": this.client_id, 
        //     "client_secret": this.client_secret,
        //     "refresh_token": this.refresh_token || undefined,
        //     "code": this.code || undefined
        // }))
        if (res.ok !== true && res.size === 0)
            throw(`PanCloudError() ${res.status} ${res.statusText}`)

        try {
            let r_json = await res.json()
            if (r_json.error || r_json.error_description) 
                throw (`PanCloudError(): ` + await res.text())
            let ret: appFrameworkTokens = {
                accessToken: r_json.access_token
            }
            this.access_token = r_json.access_token
            
            if(r_json.refresh_token) { // a new refresh token is returned
                this.refresh_token = r_json.refresh_token
                ret.refreshToken = r_json.refresh_token
            }
            //ret.refreshToken = 'test_refresh_token' // TODO: remove this
            console.log('Credentials(): Authorization token successfully retrieved')
            return ret
        } catch (exception) {
            throw (`PanCloudError() Invalid JSON: ${exception}`)
        }
    }
};