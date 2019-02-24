import { isSdkError } from 'pancloud-nodejs'
import * as dss_attributes from './dss_attributes'
import * as dss_domains from './dss_domains'
import * as dss_count from './dss_count'
import * as dss_query_users from './dss_query_users'
import * as dss_query_computers from './dss_query_computers'
import * as dss_query_ous from './dss_query_ous'
import * as dss_query_groups from './dss_query_groups'
import * as dss_query_containers from './dss_query_containers'
import * as dss_query_sublist_users from './dss_query_sublist_users'
import * as dss_query_filter_users from './dss_query_filter_users'

const examples: { [i: string]: () => Promise<void> } = {
    "ATTR": dss_attributes.main,
    "DOMAINS": dss_domains.main,
    "COUNT": dss_count.main,
    "QUERY_USERS": dss_query_users.main,
    "QUERY_COMPUTERS": dss_query_computers.main,
    "QUERY_OUS": dss_query_ous.main,
    "QUERY_GROUPS": dss_query_groups.main,
    "QUERY_CONTAINERS": dss_query_containers.main,
    "QUERY_SUBLIST_USERS": dss_query_sublist_users.main,
    "QUERY_FILTER_USERS": dss_query_filter_users.main
}

if (process.argv.length < 3 || !Object.keys(examples).includes(process.argv[2])) {
    console.log("Usage: 'node example/dss <example>' where example is one of the following keywords")
    Object.keys(examples).forEach(e => {
        console.log(`- ${e}`)
    })
    process.exit()
}

examples[process.argv[2]]().then().catch(e => {
    if (isSdkError(e)) {
        let aferr = e
        console.log(`Application Framework Error fields: code = ${aferr.getErrorCode()}, message = ${aferr.getErrorMessage()}`)
    } else {
        console.log(`General Error\n${e.stack}`)
    }
})