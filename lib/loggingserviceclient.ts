import { LoggingService, JobResult, LsQueryCfg } from './loggingservice'
import { PanCloudError } from './error'
import { Readable, ReadableOptions } from 'stream'
import { commonLogger } from './common'

const RETRIES = 20
const DELAY = 200

enum readableStates {
    'READY',
    'LOADING',
    'CLOSING',
    'CLOSED'
}

export class LoggingServiceClient extends Readable {
    private ls: LoggingService
    private cfg: LsQueryCfg
    private jr: JobResult
    private init = false
    private retries = RETRIES
    private delay = DELAY
    private state = readableStates.READY
    private sequence = 0
    static className = "LoggingServiceClient"
    private pusher = async () => {
        const data = (this.jr.result.esResult === undefined) ? [] : this.jr.result.esResult.hits.hits.map(x => x._source)
        if (this.jr.queryStatus == 'JOB_FINISHED' || this.jr.queryStatus == 'CANCELLED' || this.jr.queryStatus == 'JOB_FAILED') {
            this.state = readableStates.CLOSING
            this.push(data)
            return
        }
        this.state = readableStates.LOADING
        // safety check: queryStatus can only be 'FINISHED' at this point
        if (this.jr.queryStatus != 'FINISHED') {
            commonLogger.alert(LoggingServiceClient, `Only jobStatus = "FINISHED" expected at this point. It was "${this.jr.queryStatus}" instead`)
            throw new PanCloudError(LoggingServiceClient, 'UNKNOWN', `Only jobStatus = "FINISHED" expected at this point. It was "${this.jr.queryStatus}" instead`)
        }
        this.sequence++
        try {
            this.jr = await (this.ls.poll(this.jr.queryId, this.sequence))
        } catch (e) {
            this.destroy(e)
        }
        let attempts = 0
        while (this.jr.queryStatus == 'RUNNING' && attempts++ < this.retries) {
            this.jr = await new Promise((res, rej) => setTimeout(async () => {
                try {
                    res(await this.ls.poll(this.jr.queryId, this.sequence))
                } catch (e) {
                    rej(e)
                }
            }, this.delay))
        }
        if (attempts >= this.retries) {
            commonLogger.alert(LoggingServiceClient, `Still in ${this.jr.queryStatus} state after ${attempts} attempts`, 'LazyInit')
            await this.ls.deleteQuery(this.jr.queryId)
            throw new PanCloudError(LoggingServiceClient, 'UNKNOWN', `Still in ${this.jr.queryStatus} state after ${attempts} attempts`)
        }
        if (this.push(data)) process.nextTick(this.pusher)
        else this.state = readableStates.READY
    }


    constructor(ls: LoggingService, cfg: LsQueryCfg & { retries?: number, delay?: number }, opts?: ReadableOptions) {
        super({ ...opts, objectMode: true })
        this.ls = ls
        this.cfg = { ...cfg }
        delete this.cfg.callBack
        if (cfg.retries !== undefined) {
            this.retries = cfg.retries
        }
        if (cfg.delay !== undefined) {
            this.delay = cfg.delay
        }
    }

    private async lazyInit(): Promise<void> {
        if (!this.init) {
            this.jr = await this.ls.query(this.cfg)
            let attempts = 0
            while (this.jr.queryStatus == 'RUNNING' && attempts++ < this.retries) {
                this.jr = await new Promise((res, rej) => setTimeout(async () => {
                    try {
                        res(await this.ls.poll(this.jr.queryId, 0))
                    } catch (e) {
                        rej(e)
                    }
                }, this.delay))
            }
            if (attempts >= this.retries) {
                commonLogger.alert(LoggingServiceClient, `Still in ${this.jr.queryStatus} state after ${attempts} attempts`, 'LazyInit')
                await this.ls.deleteQuery(this.jr.queryId)
                throw new PanCloudError(LoggingServiceClient, 'UNKNOWN', `Still in ${this.jr.queryStatus} state after ${attempts} attempts`)
            }
            if (this.jr.queryStatus == 'JOB_FAILED') {
                commonLogger.alert(LoggingServiceClient, 'Job Failed', 'LazyInit')
                throw new PanCloudError(LoggingServiceClient, 'UNKNOWN', 'Job Failed')
            }
        }
        this.init = true
    }

    _read(): void {
        this.lazyInit().then(() => {
            switch (this.state) {
                case readableStates.READY:
                    process.nextTick(this.pusher)
                    break
                case readableStates.CLOSING:
                    this.state = readableStates.CLOSED
                    this.push(null)
            }
        }).catch(e => process.nextTick(() => this.emit('error', e)))
    }

    _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
        if (this.jr === undefined) callback(null)
        else this.ls.deleteQuery(this.jr.queryId).then(() => callback(null), e => callback(e))
    }
}