/**
 * Utility collection
 */
/// <reference types="node" />
/**
 * Class containing a static public method with utilities
 */
export declare class util {
    private static typeAlias;
    private static dnsResolve;
    private static dnsProcessElement;
    /**
     * Transforms the object provided decoding all DNS fields found in it
     * @param event Any Application Framework event object. Only the ones with type == 'DPI' and
     * subtype == 'dns' will be processed
     */
    static dnsDecode(event: any): boolean;
    /**
    * Converts a the pcap base64 string found on some Application Framework events into
    * a pcap file payload
    * @param event The Application Framework event object containing the pcap property
    * @return a Buffer containing a valid pcap file payload or null if the provided
    * event does not have a valid pcap property
    */
    static pcaptize(event: any): Buffer | null;
}
