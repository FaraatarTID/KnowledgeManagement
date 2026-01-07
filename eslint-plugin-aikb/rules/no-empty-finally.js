/**
 * @fileoverview Prevents empty finally blocks that might leave resources in bad state
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent empty finally blocks',
      category: 'Possible Bugs',
      recommended: true
    },
    fixable: null,
    schema: []
  },

  create(context) {
    return {
      TryStatement(node) {
        if (!node.finalizer) return;
        
        const finalizerBody = node.finalizer.body;
        if (finalizerBody.length === 0) {
          context.report({
            node: node.finalizer,
            message: 'Empty finally block - resources may remain in locked/loaded state'
          });
          return;
        }

        // Check if finally block only has comments
        const hasCode = finalizerBody.some(statement => statement.type !== 'EmptyStatement');
        if (!hasCode) {
          context.report({
            node: node.finalizer,
            message: 'Finally block only contains comments - actual cleanup code is required'
          });
        }
      }
    };
  }
};