import { request, RequestOptions } from 'https'
import { URL } from 'url'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'
export interface FetchOptions {
    method: HttpMethod,
    headers?: { [i: string]: string },
    body?: string,
    timeout?: number
}
const statusTextDict: { [i: number]: string } = {
    200: '200 OK',
    300: '301 Moved Permanently',
    302: '302 Found',
    303: '303 See Other',
    304: '304 Not Modified',
    400: '400 Bad Request',
    401: '401 Unauthorized',
    500: '500 Internal Server Error',
    501: '501 Not Implemented',
    502: '502 Bad Gateway',
    503: '503 Service Unavailable',
    504: '504 Gateway Timeout'
}

class FetchResponse {
    ok: boolean
    status: number
    statusText: string
    size: number
    private data: string

    private constructor(ok: boolean, data = '', status = 200) {
        this.ok = ok
        this.data = data
        this.status = status
        this.statusText = (statusTextDict[status]) ? statusTextDict[status] : String(status)
        this.size = data.length
    }

    text(): string {
        return this.data
    }

    json(): any {
        return JSON.parse(this.data)
    }

    static response(ok: boolean, data?: string, status?: number): FetchResponse {
        return new FetchResponse(ok, data, status)
    }
}

export function fetch(url: string, ops: FetchOptions): Promise<FetchResponse> {
    let newUrl = new URL(url)
    let rOps: RequestOptions = {
        protocol: newUrl.protocol,
        hostname: newUrl.hostname,
        path: newUrl.pathname,
        method: ops.method,
        headers: ops.headers,
        timeout: ops.timeout
    }

    return new Promise((resolve, reject) => {
        let cRequest = request(rOps, resp => {
            let data = '';
            resp.on('data', chunk => {
                data += chunk;
            });
            resp.on('end', () => {
                resolve(FetchResponse.response(
                    !(resp.statusCode && (resp.statusCode < 200 || resp.statusCode > 299)),
                    data,
                    resp.statusCode));
            });
        }).on("error", err => {
            reject(Error(err.message))
        });
        cRequest.end(ops.body)
    })
}

