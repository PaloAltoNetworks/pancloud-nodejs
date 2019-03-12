import * as cred_basic from './credential_basic'
const examples: { [i: string]: () => Promise<void> } = {
    "BASIC": cred_basic.main,
}

if (process.argv.length < 3 || !Object.keys(examples).includes(process.argv[2])) {
    console.log("Usage: 'node example/credential <example>' where example is one of the following keywords")
    Object.keys(examples).forEach(e => {
        console.log(`- ${e}`)
    })
    process.exit()
}

examples[process.argv[2]]().then().catch(e => {
    console.log(`General Error\n${e.stack}`)
})
