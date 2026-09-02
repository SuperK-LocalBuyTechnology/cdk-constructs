import * as path from "path";
import { App, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";

/**
 * Absolute path to a minimal real Lambda entry file. NodejsFunction runs esbuild
 * against `entry` during synth, so tests need a file that actually exists.
 */
export const FIXTURE_ENTRY = path.join(__dirname, "..", "fixtures", "handler.ts");

/**
 * Synthesizes a throwaway stack and returns its assertions Template.
 * Stack id is fixed so CloudFormation logical IDs are stable across tests.
 */
export function synthStack(fn: (stack: Stack) => void): Template {
    const app = new App();
    const stack = new Stack(app, "TestStack", {
        env: { account: "111122223333", region: "us-east-1" },
    });
    fn(stack);
    return Template.fromStack(stack);
}
