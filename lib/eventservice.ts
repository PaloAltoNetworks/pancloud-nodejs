// Logging Service

import fetch from 'node-fetch';

const ES_BASE_URL: string = "https://api.us.paloaltonetworks.com/event-service/v1/channels";
const DEFAULT_CHANNEL_ID: string = "EventFilter";

export class EventService {

    private es_base_url: string;
    private auth_token: string;
    private channel_id: string;

    // Initialize
    constructor(es_base_url?: string, auth_token?: string, channel_id?: string) {
        this.es_base_url = es_base_url ? es_base_url : ES_BASE_URL;
        this.auth_token = auth_token ? auth_token : undefined;
        this.channel_id = channel_id ? channel_id : DEFAULT_CHANNEL_ID;
    };

    public set_auth_token(auth_token: string) { this.auth_token = auth_token };
    public get_auth_token(): string { return this.auth_token };

    public async get_filters(): Promise <any> {
        let url: string = `${this.es_base_url}/${this.channel_id}/filters`;
        let auth_token = this.auth_token;
        let res = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + auth_token
            }
        });

        if (res.ok === false)
            throw(`PanCloudError() ${res.status} ${res.statusText}`);

        try {
            return await res.json();
        } catch (exception) {
            throw (`PanCloudError() Invalid JSON: ${exception}`);
        }
    };

    public async set_filters(filters: any[]): Promise <void> {
        let url: string = `${this.es_base_url}/${this.channel_id}/filters`;
        let auth_token = this.auth_token;
        let res = await fetch(url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + auth_token
            },
            body: JSON.stringify({
                "filters": filters
            })
        });

        if (res.ok === false)
            throw(`PanCloudError() ${res.status} ${res.statusText}`);
    };

    public async poll(timeout: number): Promise <any> {
        let url: string = `${this.es_base_url}/${this.channel_id}/poll`;
        let auth_token = this.auth_token;
        let res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + auth_token
            },
            body: JSON.stringify({
                "pollTimeout": timeout
            })
        });
        if (res.ok === false)
            throw(`PanCloudError() ${res.status} ${res.statusText}`);

        try {
            return await res.json();
        } catch (exception) {
            throw (`PanCloudError() Invalid JSON: ${exception}`);
        }
    };

    public async ack(): Promise <void> {
        let url: string = `${this.es_base_url}/${this.channel_id}/ack`;
        let auth_token = this.auth_token;
        let res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + auth_token
            }
        });

        if (res.ok === false)
            throw(`PanCloudError() ${res.status} ${res.statusText}`);
    };

    public async nack(): Promise <void> {
        let url: string = `${this.es_base_url}/${this.channel_id}/nack`;
        let auth_token = this.auth_token;
        let res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + auth_token
            }
        });

        if (res.ok === false)
            throw(`PanCloudError() ${res.status} ${res.statusText}`);
    };
}