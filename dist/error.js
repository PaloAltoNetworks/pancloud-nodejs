"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function isError(obj) {
    return typeof obj.errorCode == 'string' && typeof obj.errorMessage == 'string';
}
function isSdkError(e) {
    return e &&
        e.getErrorCode && typeof e.getErrorCode == "function" &&
        e.getErrorMessage && typeof e.getErrorMessage == "function" &&
        e.getSourceClass && typeof e.getSourceClass == "function" &&
        e.name && typeof e.name == "string" &&
        (e.name == "PanCloudError" || e.name == "ApplicationFrameworkError");
}
exports.isSdkError = isSdkError;
class ApplicationFrameworkError extends Error {
    constructor(source, afError) {
        if (isError(afError)) {
            super(afError.errorMessage);
            this.errorMessage = afError.errorMessage;
            this.errorCode = afError.errorCode;
        }
        else {
            super("Unparseable Application Framework error message");
            this.errorMessage = JSON.stringify(afError);
            this.errorCode = '';
        }
        this.sourceClass = source.className;
        this.setClassName("ApplicationFrameworkError");
    }
    getErrorCode() {
        return this.errorCode;
    }
    getErrorMessage() {
        return this.errorMessage;
    }
    getSourceClass() {
        return this.sourceClass;
    }
    setClassName(name) {
        this.name = name;
    }
}
exports.ApplicationFrameworkError = ApplicationFrameworkError;
class PanCloudError extends Error {
    constructor(source, code, message) {
        super(message);
        this.errorCode = code;
        this.errorMessage = message;
        this.sourceClass = source.className;
        this.setClassName("PanCloudError");
    }
    static fromError(sorce, e) {
        let newpce = new PanCloudError(sorce, "UNKNOWN", e.message);
        newpce.stack = e.stack;
        return newpce;
    }
    getErrorCode() {
        return this.errorCode;
    }
    getErrorMessage() {
        return this.errorMessage;
    }
    getSourceClass() {
        return this.sourceClass;
    }
    setClassName(name) {
        this.name = name;
    }
}
exports.PanCloudError = PanCloudError;
