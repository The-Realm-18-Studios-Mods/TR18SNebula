"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JdkDistribution = void 0;
/**
 * Supported JDK Distributions
 *
 * @since 1.2.0
 */
var JdkDistribution;
(function (JdkDistribution) {
    /**
     * Amazon Corretto
     * @see https://aws.amazon.com/corretto/
     * @since 1.2.0
     */
    JdkDistribution["CORRETTO"] = "CORRETTO";
    /**
     * Eclipse Temurin
     * @see https://projects.eclipse.org/projects/adoptium.temurin
     * @since 1.2.0
     */
    JdkDistribution["TEMURIN"] = "TEMURIN";
})(JdkDistribution || (exports.JdkDistribution = JdkDistribution = {}));
