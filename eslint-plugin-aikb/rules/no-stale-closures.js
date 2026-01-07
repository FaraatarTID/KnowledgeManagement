/**
 * @fileoverview Prevents stale closures in React hooks
 * Detects useCallback with empty deps used in useEffect with non-empty deps
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent stale closures in React hooks',
      category: 'Possible Bugs',
      recommended: true
    },
    fixable: null,
    schema: []
  },

  create(context) {
    const useCallbackCalls = new Map();
    const useEffectCalls = [];

    return {
      CallExpression(node) {
        // Track useCallback calls
        if (node.callee.name === 'useCallback' || 
            (node.callee.type === 'MemberExpression' && 
             node.callee.object.name === 'React' && 
             node.callee.property.name === 'useCallback')) {
          
          const callbackArg = node.arguments[0];
          const depsArg = node.arguments[1];
          
          if (depsArg && depsArg.type === 'ArrayExpression' && depsArg.elements.length === 0) {
            // Get the variable name if assigned
            const parent = node.parent;
            if (parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier') {
              useCallbackCalls.set(parent.id.name, {
                node: node,
                callback: callbackArg,
                hasEmptyDeps: true
              });
            }
          }
        }

        // Track useEffect calls
        if (node.callee.name === 'useEffect' || 
            (node.callee.type === 'MemberExpression' && 
             node.callee.object.name === 'React' && 
             node.callee.property.name === 'useEffect')) {
          
          const depsArg = node.arguments[1];
          if (depsArg && depsArg.type === 'ArrayExpression') {
            useEffectCalls.push({
              node: node,
              deps: depsArg,
              hasNonEmptyDeps: depsArg.elements.length > 0
            });
          }
        }
      },

      'Program:exit'() {
        // Check for patterns where useCallback with empty deps is used in useEffect with non-empty deps
        useEffectCalls.forEach(effect => {
          if (!effect.hasNonEmptyDeps) return;

          // Get the callback function body
          const callbackArg = effect.node.arguments[0];
          if (!callbackArg || callbackArg.type !== 'FunctionExpression' && callbackArg.type !== 'ArrowFunctionExpression') return;

          // Look for calls to useCallback'd functions inside the effect
          const code = context.getSourceCode().getText(callbackArg);
          
          useCallbackCalls.forEach((useCallbackInfo, varName) => {
            if (code.includes(varName + '(') || code.includes(varName + '.')) {
              context.report({
                node: useCallbackInfo.node,
                message: `Potential stale closure: '${varName}' is memoized with empty dependencies but used in a useEffect with non-empty dependencies. This may capture stale state.`
              });
            }
          });
        });
      }
    };
  }
};