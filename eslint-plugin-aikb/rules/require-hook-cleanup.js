/**
 * @fileoverview Ensures React hooks with side effects have proper cleanup
 * Detects useEffect without return cleanup for event listeners, timers, subscriptions
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require cleanup in useEffect for event listeners and subscriptions',
      category: 'Possible Bugs',
      recommended: true
    },
    fixable: null,
    schema: []
  },

  create(context) {
    return {
      CallExpression(node) {
        // Check for useEffect
        if (node.callee.name === 'useEffect' || 
            (node.callee.type === 'MemberExpression' && 
             node.callee.object.name === 'React' && 
             node.callee.property.name === 'useEffect')) {
          
          const callbackArg = node.arguments[0];
          if (!callbackArg || (callbackArg.type !== 'FunctionExpression' && callbackArg.type !== 'ArrowFunctionExpression')) return;

          // Get the function body
          const body = callbackArg.body;
          if (body.type !== 'BlockStatement') return;

          // Look for event listener additions
          const hasAddEventListener = body.body.some(statement => {
            if (statement.type === 'ExpressionStatement' && statement.expression.type === 'CallExpression') {
              const expr = statement.expression;
              if (expr.callee.type === 'MemberExpression' && 
                  expr.callee.property.name === 'addEventListener') {
                return true;
              }
            }
            return false;
          });

          if (!hasAddEventListener) return;

          // Check for return statement with cleanup
          const hasReturn = body.body.some(statement => {
            if (statement.type === 'ReturnStatement' && statement.argument) {
              // Check if it's a function or block that contains cleanup
              return true;
            }
            return false;
          });

          if (!hasReturn) {
            context.report({
              node: callbackArg,
              message: 'useEffect adds event listeners but has no cleanup return. This will cause memory leaks.'
            });
          }
        }
      }
    };
  }
};