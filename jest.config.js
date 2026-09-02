module.exports = {
    testEnvironment: "node",
    roots: ["<rootDir>/test"],
    testMatch: ["**/*.test.ts"],
    passWithNoTests: true,
    transform: {
        "^.+\\.tsx?$": "ts-jest",
    },
};
