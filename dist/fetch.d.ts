export declare type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
export interface FetchOptions {
    method: HttpMethod;
    headers?: {
        [i: string]: string;
    };
    body?: string;
    timeout?: number;
}
declare class FetchResponse {
    ok: boolean;
    status: number;
    statusText: string;
    size: number;
    private data;
    private constructor();
    text(): string;
    json(): any;
    static response(ok: boolean, data?: string, status?: number): FetchResponse;
}
export declare function fetch(url: string, ops: FetchOptions): Promise<FetchResponse>;
export {};
