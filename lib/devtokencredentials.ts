import { env } from 'process'
import { fetch } from './fetch'
import { Credentials, CredentialsOptions } from './credentials'
import { retrier, expTokenExtractor } from './common'
import { PanCloudError } from './error'

const ENV_DEVELOPER_TOKEN = 'PAN_DEVELOPER_TOKEN'
const ENV_DEVELOPER_TOKEN_PROVIDER = 'PAN_DEVELOPER_TOKEN_PROVIDER'
const DEV_TOKEN_PROVIDER = 'https://app.apiexplorer.rocks/request_token'

interface ApexResponse {
    access_token: string
}

function isApexResponse(obj: any): obj is ApexResponse {
    return obj && typeof obj == 'object' &&
        obj.access_token && typeof obj.access_token == 'string'
}

export interface DevTokenCredentialsOptions extends CredentialsOptions {
    /**
     * Environmental variable containing the Developer Token string
     */
    envDevToken?: string,
    /**
     * Environmental variable containing the URI for the developer token provider
     */
    envDevTokenProvider?: string,
    /**
     * URI for the developer token provider
     */
    developerTokenProvider?: string,
    /**
     * Developer Token string
     */
    developerToken?: string
}

export class DevTokenCredentials extends Credentials {
    private developerToken: string
    private developerTokenProvider: string
    static className = 'DevTokenCredentials'

    constructor(ops?: DevTokenCredentialsOptions) {
        super((ops) ? ops.guardTime : undefined)
        let envDevToken = (ops && ops.envDevToken) ? ops.envDevToken : ENV_DEVELOPER_TOKEN
        let envDevTokenProvider = (ops && ops.envDevTokenProvider) ? ops.envDevTokenProvider : ENV_DEVELOPER_TOKEN_PROVIDER
        let developerToken = (ops && ops.developerToken) ? ops.developerToken : env[envDevToken]
        if (!developerToken) {
            throw new PanCloudError(DevTokenCredentials, 'PARSER',
                `Environmental variable ${envDevToken} does not exists or contains null data`)
        }
        let tokenProvider = (ops && ops.developerTokenProvider) ? ops.developerTokenProvider : env[envDevTokenProvider]
        let finalTokenProvider = tokenProvider ? tokenProvider : DEV_TOKEN_PROVIDER
        this.developerToken = developerToken
        this.developerTokenProvider = finalTokenProvider
    }

    private static async devTokenConsume(entrypoint: string, token: string): Promise<string> {
        let res = await retrier(DevTokenCredentials, undefined, undefined, fetch, entrypoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        })
        if (!res.ok) {
            throw new PanCloudError(DevTokenCredentials, 'UNKNOWN',
                `non 200 Response from the Developer Token Provider at ${entrypoint}`)
        }
        let rJson: any
        try {
            rJson = await res.json()
        } catch (exception) {
            throw new PanCloudError(DevTokenCredentials, 'PARSER',
                `non valid JSON content received from the Developer Token Provider at ${entrypoint}`)
        }
        if (isApexResponse(rJson)) {
            return rJson.access_token
        }
        throw new PanCloudError(DevTokenCredentials, 'PARSER',
            `non valid access_token property found in the response received from the Developer Token Provider at ${entrypoint}`)
    }

    public async retrieveAccessToken(): Promise<void> {
        let accessToken = await DevTokenCredentials.devTokenConsume(this.developerTokenProvider, this.developerToken)
        this.setAccessToken(accessToken, expTokenExtractor(this, accessToken))
    }
}