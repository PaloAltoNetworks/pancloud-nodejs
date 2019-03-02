import { FileCredentialsOptions, EnvCredentialsOptions } from './oa2credentials';
import { DevTokenCredentialsOptions } from './devtokencredentials';
import { Credentials } from './credentials';
export declare function autoCredentials(opt?: FileCredentialsOptions | EnvCredentialsOptions | DevTokenCredentialsOptions): Promise<Credentials>;
