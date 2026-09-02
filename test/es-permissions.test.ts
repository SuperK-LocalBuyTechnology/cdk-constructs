import { VanillaLambda } from "../lib/vanilla-lambda";
import { FIXTURE_ENTRY, synthStack } from "./helpers/synth";

const baseProps = {
    functionName: "test-fn",
    handler: "handler",
    entry: FIXTURE_ENTRY,
};

const DOMAIN = "arn:aws:es:us-east-1:111122223333:domain/widgets/*";

function statementsFor(esPermissions: Record<string, string[]>) {
    const template = synthStack((stack) => {
        new VanillaLambda(stack, "Fn", { ...baseProps, esPermissions });
    });
    const policies = template.findResources("AWS::IAM::Policy");
    return Object.values(policies).flatMap((p: any) => p.Properties.PolicyDocument.Statement as any[]);
}

function actionsFor(esPermissions: Record<string, string[]>) {
    return statementsFor(esPermissions).flatMap((s) => (Array.isArray(s.Action) ? s.Action : [s.Action]));
}

describe("VanillaLambda esPermissions", () => {
    it("grants read-only ES HTTP actions for `read`", () => {
        const actions = actionsFor({ read: [DOMAIN] });
        expect(actions).toContain("es:ESHttpGet");
        expect(actions).toContain("es:ESHttpHead");
        expect(actions).not.toContain("es:ESHttpPut");
        expect(actions).not.toContain("es:ESHttpDelete");
        // Deliberate per the documented limitation (design ruling R8): OpenSearch's
        // verb-based IAM cannot distinguish POST /_search from POST /index/_doc, so
        // granting POST under a key named `read` would silently confer document-write
        // access. Do not "helpfully" widen `read` to include this.
        expect(actions).not.toContain("es:ESHttpPost");
    });

    it("grants read and write ES HTTP actions for `readAndWrite`", () => {
        const actions = actionsFor({ readAndWrite: [DOMAIN] });
        expect(actions).toContain("es:ESHttpGet");
        expect(actions).toContain("es:ESHttpHead");
        expect(actions).toContain("es:ESHttpPost");
        expect(actions).toContain("es:ESHttpPut");
        expect(actions).not.toContain("es:ESHttpDelete");
    });

    it("grants the delete ES HTTP action for `delete`", () => {
        const actions = actionsFor({ delete: [DOMAIN] });
        expect(actions).toContain("es:ESHttpDelete");
        expect(actions).not.toContain("es:ESHttpPut");
    });

    it("scopes each grant to the supplied resources", () => {
        const statements = statementsFor({ read: [DOMAIN] });
        const esStatement = statements.find(
            (s) => Array.isArray(s.Action) && s.Action.includes("es:ESHttpGet")
        );
        expect(esStatement).toBeDefined();
        const resource = Array.isArray(esStatement.Resource) ? esStatement.Resource : [esStatement.Resource];
        expect(resource).toEqual([DOMAIN]);
    });

    it("still grants es:* for `allActions`, unchanged", () => {
        const actions = actionsFor({ allActions: [DOMAIN] });
        expect(actions).toContain("es:*");
    });

    it("combines multiple sub-keys into separate statements", () => {
        const statements = statementsFor({ read: [DOMAIN], delete: [DOMAIN] });
        const esStatements = statements.filter((s) => {
            const actions = Array.isArray(s.Action) ? s.Action : [s.Action];
            return actions.some((a: string) => a.startsWith("es:"));
        });
        // Must be two distinct statements, not one merged statement with both action sets.
        expect(esStatements).toHaveLength(2);
        const actionSets = esStatements
            .map((s) => (Array.isArray(s.Action) ? [...s.Action].sort() : [s.Action]))
            .sort();
        expect(actionSets).toEqual([["es:ESHttpDelete"], ["es:ESHttpGet", "es:ESHttpHead"]]);
    });

    it("emits no ES statements when esPermissions is omitted", () => {
        const template = synthStack((stack) => {
            new VanillaLambda(stack, "Fn", baseProps);
        });
        const policies = template.findResources("AWS::IAM::Policy");
        const actions = Object.values(policies)
            .flatMap((p: any) => p.Properties.PolicyDocument.Statement as any[])
            .flatMap((s) => (Array.isArray(s.Action) ? s.Action : [s.Action]));
        expect(actions.filter((a: string) => a.startsWith("es:"))).toHaveLength(0);
    });
});
