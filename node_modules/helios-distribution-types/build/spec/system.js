"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Architecture = exports.Platform = void 0;
/**
 * Supported platforms.
 * @since 1.2.0
 */
var Platform;
(function (Platform) {
    /**
     * macOS
     * @since 1.2.0
     */
    Platform["DARWIN"] = "darwin";
    /**
     * Linux
     * @since 1.2.0
     */
    Platform["LINUX"] = "linux";
    /**
     * Windows
     * @since 1.2.0
     */
    Platform["WIN32"] = "win32";
})(Platform || (exports.Platform = Platform = {}));
/**
 * Supported architectures.
 * @since 1.2.0
 */
var Architecture;
(function (Architecture) {
    /**
     * arm64
     * @since 1.2.0
     */
    Architecture["ARM64"] = "arm64";
    /**
     * x64
     * @since 1.2.0
     */
    Architecture["X64"] = "x64";
})(Architecture || (exports.Architecture = Architecture = {}));
