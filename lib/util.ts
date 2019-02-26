/**
 * Utility collection
 */

import { Buffer } from "buffer";
import { commonLogger } from "./common";
import { PanCloudError } from "./error";

interface DecoDnsItem {
    seqno: number
    value: string
}

function isDecoDnsItem(item: any): item is DecoDnsItem {
    return item.seqno && item.value && typeof (item.seqno) == "number" && typeof (item.value) == "string"
}

/**
 * Class containing a static public method with utilities
 */
export class Util {
    private static typeAlias: { [i: string]: string } = {
        1: "A",
        28: "AAAA",
        18: "AFSDB",
        42: "APL",
        257: "CAA",
        60: "CDNSKEY",
        59: "CDS",
        37: "CERT",
        5: "CNAME",
        49: "DHCID",
        32769: "DLV",
        39: "DNAME",
        48: "DNSKEY",
        43: "DS",
        55: "HIP",
        45: "IPSECKEY",
        25: "KEY",
        36: "KX",
        29: "LOC",
        15: "MX",
        35: "NAPTR",
        2: "NS",
        47: "NSEC",
        3: "NSEC",
        61: "OPENPGPKEY",
        12: "PTR",
        46: "RRSIG",
        17: "RP",
        24: "SIG",
        53: "SMIMEA",
        6: "SOA",
        33: "SRV",
        44: "SSHFP",
        32768: "TA",
        249: "TKEY",
        52: "TLSA",
        250: "TSIG",
        16: "TXT",
        256: "URI",
        255: "ANY",
        252: "AXFR",
        251: "AXFR",
        41: "OPT"
    }

    private static dnsResolve(label: Uint8Array, offsets: { [i: number]: Uint8Array } = {}): string {
        if (!label.length) {
            return ""
        }
        let domain: string[] = []
        let dnsNameLen = 0
        let pointer = 0
        let code: number = label[0]
        let maxIterations = 250
        while (code) {
            if (maxIterations-- == 0) {
                throw new Error("Too many iterations (loop?)")
            }
            if (code > 63) {
                code = (code & 0x3f) << 8 | label[pointer + 1]
                pointer = 0
                if (code in offsets) {
                    label = offsets[code]
                } else if (!(Object.entries(offsets).some(([bCode, bBuf]) => {
                    let num_bCode = parseInt(bCode, 10)
                    if (num_bCode < code && code < num_bCode + bBuf.length) {
                        label = bBuf.slice(code - num_bCode)
                        return true
                    }
                    return false
                }))) {
                    throw new Error("Pointer not found")
                }
            } else {
                pointer++
                let token = String.fromCharCode(...label.slice(pointer, pointer + code))
                dnsNameLen += token.length
                if (dnsNameLen > 250) {
                    throw new Error("Name too large (loop?)")
                }
                domain.push(token)
                pointer += code
            }
            code = label[pointer]
        }
        return domain.join('.')
    }

    private static dnsProcessElement(
        element: any[],
        offsets: { [i: number]: Uint8Array },
        name_property: string,
        type_property: string): void {
        element.forEach(item => {
            if (!(type_property in item)) {
                return
            }
            let itemType = item[type_property] as number
            Object.keys(item).forEach(key => {
                if (key == type_property) {
                    item[key] = Util.typeAlias[item[key]]
                    return
                }
                let dDnsItem = item[key]
                if (isDecoDnsItem(dDnsItem)) {
                    let label = Uint8Array.from(Buffer.from(dDnsItem.value, 'base64'))
                    offsets[dDnsItem.seqno] = label
                    if (key == name_property) {
                        try {
                            item[key].value = Util.dnsResolve(label, offsets)
                        } catch {
                            throw new Error(`Unable to decode ${JSON.stringify(item)}`)
                        }
                        return
                    }
                    if (itemType == 16) { // TXT decoding
                        dDnsItem.value = label.toString()
                        return
                    }
                    if (itemType == 1) { // IPv4 decoding
                        dDnsItem.value = label.join('.')
                        return
                    }
                    if (itemType == 28) { // IPv6 decoding
                        let ipv6Parts: string[] = []
                        new Uint16Array(label.buffer).forEach(x => ipv6Parts.push(('000' + x.toString(16)).slice(-4)))
                        dDnsItem.value = ipv6Parts.join(':')
                        return
                    }
                    if ([60, 48, 45, 46, 25, 61, 43, 41].includes(itemType)) {
                        let hexParts: string[] = []
                        label.forEach(x => hexParts.push(('0' + x.toString(16)).slice(-2)))
                        dDnsItem.value = hexParts.join(':')
                        return
                    }
                    try {
                        dDnsItem.value = Util.dnsResolve(label, offsets)
                    } catch {
                        throw new Error(`Unable to decode ${JSON.stringify(item)}`)
                    }
                }
            })
        })
    }

    /**
     * Transforms the object provided decoding all DNS fields found in it
     * @param event Any Application Framework event object. Only the ones with type == 'DPI' and
     * subtype == 'dns' will be processed
     */
    public static dnsDecode(event: any): boolean {
        if (!(event.type && event.subtype && event.type == 'DPI' && event.subtype == 'dns')) {
            return false
        }
        let decoded = true
        try {
            if (event['dns-req-query-items']) {
                Util.dnsProcessElement(event['dns-req-query-items'], {}, 'dns-req-query-name', 'dns-req-query-type')
            }
            let offsets: { [i: number]: Uint8Array } = {}
            if (event['dns-rsp-query-items']) {
                Util.dnsProcessElement(event['dns-rsp-query-items'], offsets, 'dns-rsp-query-name', 'dns-rsp-query-type')
            }
            if (event['dns-rsp-resource-record-items']) {
                Util.dnsProcessElement(event['dns-rsp-resource-record-items'], offsets, 'dns-rsp-rr-name', 'dns-rsp-rr-type')
            }
        } catch (e) {
            commonLogger.error(PanCloudError.fromError({ className: "utilityclass" }, e))
            decoded = false
        }
        return decoded
    }

    /**
    * Converts a the pcap base64 string found on some Application Framework events into
    * a pcap file payload
    * @param event The Application Framework event object containing the pcap property
    * @return a Buffer containing a valid pcap file payload or null if the provided
    * event does not have a valid pcap property
    */
    public static pcaptize(event: any): Buffer | null {
        if (!(event.pcap)) {
            return null
        }
        let pcapData = Buffer.from(event.pcap as string, 'base64')
        let captureSize = pcapData.readUInt32BE(4)
        let packetSize = pcapData.readUInt16BE(30)
        let timeStamp = pcapData.readUInt32BE(16)
        let pcapBody: Buffer
        let bodySize = (captureSize > packetSize) ? packetSize : captureSize
        pcapBody = Buffer.alloc(40 + bodySize)
        pcapBody.writeUInt32BE(0xd4c3b2a1, 0) // Header Magic Number
        pcapBody.writeUInt32BE(0x00020004, 4) // Header Major and Minor version
        pcapBody.writeUInt32BE(0x00000000, 8) // Header Time Zone
        pcapBody.writeUInt32BE(0x00000000, 12) // Header Accuracy
        pcapBody.writeUInt32BE(0xffffffff, 16) // Header Snaplen
        pcapBody.writeUInt32BE(0x01000000, 20) // Header Datalink
        pcapBody.writeUInt32LE(timeStamp, 24) // Packet Timestamp
        pcapBody.writeUInt32BE(0x00000000, 28) // Packet uSeconds
        pcapBody.writeUInt32LE(bodySize, 32) // Included Size
        pcapBody.writeUInt32LE(packetSize, 36) // Original Packet Size
        pcapData.copy(pcapBody, 40, 36, 36 + bodySize)
        return pcapBody
    }
}