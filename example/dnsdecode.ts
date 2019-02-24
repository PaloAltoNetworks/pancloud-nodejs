import { util } from 'pancloud-nodejs'

let testEntries: any[] = [
    { "receive_time": 1547040279, "sessionid": 43930, "time_generated": 1547040231, "dns-rsp-reply-code": 0, "type": "DPI", "dns-rsp-transaction-id": 165, "content_ver": "8111-5239", "txn_start": 1547040231, "txn_id": 166, "dns-req-query-items": [{ "dns-req-query-name": { "value": "BmVtc3NhcwxiYW5jc2FiYWRlbGwDY29tAA==", "seqno": 12 }, "dns-req-query-type": 1 }], "dns-rsp-query-items": [{ "dns-rsp-query-name": { "value": "BmVtc3NhcwxiYW5jc2FiYWRlbGwDY29tAA==", "seqno": 12 }, "dns-rsp-query-type": 1 }], "dns-rsp-resource-record-items": [{ "dns-rsp-rr-name": { "value": "wAw=", "seqno": 41 }, "dns-rsp-rr-type": 5, "dns-rsp-rr-value": { "value": "CWVtc3Nhcy1pYQdhaW1hdGNowCA=", "seqno": 53 } }, { "dns-rsp-rr-name": { "value": "wDU=", "seqno": 73 }, "dns-rsp-rr-type": 5, "dns-rsp-rr-value": { "value": "CWVtc3Nhcy1pYQdhaW1hdGNoA25ldAA=", "seqno": 85 } }, { "dns-rsp-rr-name": { "value": "wFU=", "seqno": 108 }, "dns-rsp-rr-type": 5, "dns-rsp-rr-value": { "value": "CnRpZXIxLWV1dzEHaXJlbGFuZAhkZWxpdmVyecBf", "seqno": 120 } }, { "dns-rsp-rr-name": { "value": "wHg=", "seqno": 150 }, "dns-rsp-rr-type": 1, "dns-rsp-rr-value": { "value": "Nkg8Sg==", "seqno": 162 } }, { "dns-rsp-rr-name": { "value": "wHg=", "seqno": 166 }, "dns-rsp-rr-type": 1, "dns-rsp-rr-value": { "value": "NDDE8A==", "seqno": 178 } }, { "dns-rsp-rr-name": { "value": "wHg=", "seqno": 182 }, "dns-rsp-rr-type": 1, "dns-rsp-rr-value": { "value": "IvgzGw==", "seqno": 194 } }], "customer-id": "........", "serial": "", "receptor_txn_start": 1547040239, "subtype": "dns", "dns-req-transaction-id": 165, "dns-rsp-is-over-tcp": 0, "dns-req-is-over-tcp": 0, "client_sw": "8.1.4", "recsize": 1537 },
    { "receive_time": 1547039555, "sessionid": 506, "time_generated": 1547039512, "dns-rsp-reply-code": 0, "type": "DPI", "dns-rsp-transaction-id": 26297, "content_ver": "8111-5239", "txn_start": 1547039512, "dns-rsp-query-items": [{ "dns-rsp-query-name": { "value": "BHdzMTIDZ3RpBm1jYWZlZQNjb20A", "seqno": 12 }, "dns-rsp-query-type": 28 }], "txn_id": 26298, "dns-req-query-items": [{ "dns-req-query-name": { "value": "BHdzMTIDZ3RpBm1jYWZlZQNjb20A", "seqno": 12 }, "dns-req-query-type": 28 }], "dns-rsp-resource-record-items": [{ "dns-rsp-rr-name": { "value": "wAw=", "seqno": 37 }, "dns-rsp-rr-type": 5, "dns-rsp-rr-value": { "value": "BHdzMTIDZ3RpBm1jYWZlZQZha2FkbnMDbmV0AA==", "seqno": 49 } }, { "dns-rsp-rr-name": { "value": "wEE=", "seqno": 77 }, "dns-rsp-rr-type": 6, "dns-rsp-soa-primary-name-server": { "value": "CGludGVybmFswEE=", "seqno": 89 } }], "customer-id": ".........", "serial": "", "receptor_txn_start": 1547039517, "subtype": "dns", "dns-req-transaction-id": 26297, "dns-rsp-is-over-tcp": 0, "dns-req-is-over-tcp": 0, "client_sw": "8.1.4", "recsize": 1006 },
    { "receive_time": 1547040972, "sessionid": 43196, "time_generated": 1547040931, "dns-rsp-reply-code": 3, "type": "DPI", "dns-rsp-transaction-id": 60122, "content_ver": "8111-5239", "txn_start": 1547040931, "dns-rsp-query-items": [{ "dns-rsp-query-name": { "value": "DV9hdXRvZGlzY292ZXIEX3RjcAtzbWEtaWJlcmljYQNjb20A", "seqno": 12 }, "dns-rsp-query-type": 33 }], "txn_id": 60123, "dns-req-query-items": [{ "dns-req-query-name": { "value": "DV9hdXRvZGlzY292ZXIEX3RjcAtzbWEtaWJlcmljYQNjb20A", "seqno": 12 }, "dns-req-query-type": 33 }], "dns-rsp-resource-record-items": [{ "dns-rsp-rr-name": { "value": "wB8=", "seqno": 52 }, "dns-rsp-rr-type": 6, "dns-rsp-soa-primary-name-server": { "value": "A25zMQdldXJvZG5zwCs=", "seqno": 64 } }, { "dns-rsp-rr-name": { "value": "AA==", "seqno": 111 }, "dns-rsp-rr-type": 41, "dns-rsp-rr-value": { "value": "", "seqno": 122 } }], "customer-id": ".........", "serial": "", "receptor_txn_start": 1547040935, "subtype": "dns", "dns-req-transaction-id": 60122, "dns-rsp-is-over-tcp": 0, "dns-req-is-over-tcp": 0, "client_sw": "8.1.4", "recsize": 1015 },
    { "receive_time": 1547042089, "sessionid": 39763, "time_generated": 1547042065, "dns-rsp-reply-code": 0, "type": "DPI", "dns-rsp-transaction-id": 25653, "content_ver": "8111-5239", "txn_start": 1547042065, "dns-rsp-query-items": [{ "dns-rsp-query-name": { "value": "BHBsYXkGZ29vZ2xlA2NvbQA=", "seqno": 12 }, "dns-rsp-query-type": 28 }], "txn_id": 25654, "dns-req-query-items": [{ "dns-req-query-name": { "value": "BHBsYXkGZ29vZ2xlA2NvbQA=", "seqno": 12 }, "dns-req-query-type": 28 }], "dns-rsp-resource-record-items": [{ "dns-rsp-rr-name": { "value": "wAw=", "seqno": 33 }, "dns-rsp-rr-type": 28, "dns-rsp-rr-value": { "value": "KgAUUEADCAIAAAAAAAAgDg==", "seqno": 45 } }], "customer-id": ".........", "serial": "", "receptor_txn_start": 1547042071, "subtype": "dns", "dns-req-transaction-id": 25653, "dns-rsp-is-over-tcp": 0, "dns-req-is-over-tcp": 0, "client_sw": "8.1.4", "recsize": 839 },
    { "receive_time": 1547039525, "sessionid": 23229, "time_generated": 1547039489, "dns-rsp-reply-code": 0, "type": "DPI", "dns-rsp-transaction-id": 5792, "content_ver": "8111-5239", "txn_start": 1547039489, "dns-rsp-query-items": [{ "dns-rsp-query-name": { "value": "A2NybANwa2kEZ29vZwA=", "seqno": 12 }, "dns-rsp-query-type": 1 }], "txn_id": 5793, "dns-req-query-items": [{ "dns-req-query-name": { "value": "A2NybANwa2kEZ29vZwA=", "seqno": 12 }, "dns-req-query-type": 1 }], "dns-rsp-resource-record-items": [{ "dns-rsp-rr-name": { "value": "wBA=", "seqno": 30 }, "dns-rsp-rr-type": 2, "dns-rsp-rr-value": { "value": "A25zMQR6ZG5zBmdvb2dsZQA=", "seqno": 42 } }, { "dns-rsp-rr-name": { "value": "wBA=", "seqno": 59 }, "dns-rsp-rr-type": 2, "dns-rsp-rr-value": { "value": "A25zMsAu", "seqno": 71 } }, { "dns-rsp-rr-name": { "value": "wBA=", "seqno": 77 }, "dns-rsp-rr-type": 2, "dns-rsp-rr-value": { "value": "A25zM8Au", "seqno": 89 } }, { "dns-rsp-rr-name": { "value": "wBA=", "seqno": 95 }, "dns-rsp-rr-type": 2, "dns-rsp-rr-value": { "value": "A25zNMAu", "seqno": 107 } }, { "dns-rsp-rr-name": { "value": "wBA=", "seqno": 113 }, "dns-rsp-rr-type": 43, "dns-rsp-rr-value": { "value": "TVkIAgPwujbHqFU59MoVSdwGK9HLwhe0mQI9SSJY7CwXU/mN", "seqno": 125 } }, { "dns-rsp-rr-name": { "value": "wBA=", "seqno": 161 }, "dns-rsp-rr-type": 46, "dns-rsp-rr-value": { "value": "ACsIAgAAALRcTZtyXDCacilABGdvb2cALTX557t50dGbe1SxXxxFzXoqb3DH5MC2r72xp3T77XLTfooN1BbVw+Q8rNhrkDPJKK3sywpz9yQXoq1IzvuBGMTD9rfiIw/gAS0dijIRcPGvgMlc4PP86b/htNvHqsyO/4HaIwo07ZTbyW2zCRI6ESyjCFHe3qm9o12H0BIre6o=", "seqno": 173 } }, { "dns-rsp-rr-name": { "value": "AA==", "seqno": 325 }, "dns-rsp-rr-type": 41, "dns-rsp-rr-value": { "value": "", "seqno": 336 } }], "customer-id": ".........", "serial": "", "receptor_txn_start": 1547039494, "subtype": "dns", "dns-req-transaction-id": 5792, "dns-rsp-is-over-tcp": 0, "dns-req-is-over-tcp": 0, "client_sw": "8.1.4", "recsize": 1801 }
]

testEntries.forEach(x => {
    util.dnsDecode(x)
    console.log('___')
    console.log(JSON.stringify(x, undefined, ' '))
})