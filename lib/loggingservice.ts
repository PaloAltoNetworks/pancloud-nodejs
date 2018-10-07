// Logging Service

import fetch from 'node-fetch';

const LS_QUERY_BASE_URL: string = "https://api.us.paloaltonetworks.com/logging-service/v1/queries"

export class LoggingService {

    private url: string;
    private auth_token: string;

    // Initialize 
    constructor(url?: string, auth_token?: string) {
        this.url = url ? url : LS_QUERY_BASE_URL
        this.auth_token = auth_token ? auth_token : undefined

    };

    public set_auth_token(auth_token: string) { this.auth_token = auth_token };
    public get_auth_token(): string { return this.auth_token };

    public async create_query(startTime: number, endTime: number, maxWaitTime: number, sql: string):Promise <any> {
        let url: string = this.url; // .bind(this)); // TODO: is bind(this) a better way to do it?
        let auth_token = this.auth_token
        let res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + auth_token
            },
            body: JSON.stringify({
                "startTime": startTime, 
                "endTime": endTime,
                "maxWaitTime": maxWaitTime, 
                "query": sql 
            }),
        });

        if (res.ok === false)
            throw(`PanCloudError() ${res.status} ${res.statusText}`)
    
        try {
            let r_json = await res.json()
            return r_json
        } catch (exception) {
            throw (`PanCloudError() Invalid JSON: ${exception}`)
        }
    };

    public async poll(queryId: string, index: number): Promise <any> {
        let url: string = `${this.url}/${queryId}/${index}`
        let auth_token = this.auth_token
        console.log('poll(): url is: ', url)
        console.log('poll(): queryId is :', queryId)
        let res = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + auth_token
            }
        })
        if (res.ok === false)
            throw(`PanCloudError() ${res.status} ${res.statusText}`)

        try {
            let r_json = await res.json()
            return r_json
        } catch (exception) {
            throw (`PanCloudError() Invalid JSON: ${exception}`)
        }
    }
}