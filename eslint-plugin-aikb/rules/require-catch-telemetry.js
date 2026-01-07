/**
 * @fileoverview Ensures catch blocks include telemetry/logging
 * Prevents silent failures
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require telemetry in catch blocks',
      category: 'Possible Bugs',
      recommended: true
    },
    fixable: null,
    schema: []
  },

  create(context) {
    return {
      CatchClause(node) {
        // Check if the catch block has any logging or telemetry
        const body = node.body.body;
        
        if (body.length === 0) {
          context.report({
            node: node,
            message: 'Empty catch block - failures will be silently swallowed'
          });
          return;
        }

        // Check for console.error, console.warn, or telemetry calls
        const hasTelemetry = body.some(statement => {
          if (statement.type === 'ExpressionStatement') {
            const expr = statement.expression;
            if (expr.type === 'CallExpression') {
              const callee = expr.callee;
              // Check for console methods
              if (callee.type === 'MemberExpression' && 
                  callee.object.name === 'console' &&
                  ['error', 'warn', 'log'].includes(callee.property.name)) {
                return true;
              }
              // Check for telemetry methods
              if (callee.type === 'Identifier' && 
                  ['logEvent', 'recordEvent', 'sendAlert'].includes(callee.name)) {
                return true;
              }
              // Check for fetch calls to monitoring endpoints
              if (callee.type === 'Identifier' && callee.name === 'fetch') {
                return true;
              }
            }
          }
          return false;
        });

        if (!hasTelemetry) {
          context.report({
            node: node,
            message: 'Catch block should include telemetry (console.error, logEvent, or fetch to monitoring)'
          });
        }
      }
    };
  }
};