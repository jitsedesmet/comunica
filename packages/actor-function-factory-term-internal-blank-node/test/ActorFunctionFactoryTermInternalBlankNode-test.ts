import { Bus } from '@comunica/core';
import { BlankNode, NamedNode, StringLiteral } from '@comunica/utils-expression-evaluator';
import { getMockInternalEvaluator } from '@comunica/utils-jest';
import { ActorFunctionFactoryTermInternalBlankNode, TermFunctionInternalBlankNode } from '../lib';

describe('ActorFunctionFactoryTermInternalBlankNode', () => {
  let termFunction: TermFunctionInternalBlankNode;

  beforeEach(async() => {
    const actor = new ActorFunctionFactoryTermInternalBlankNode({ name: 'actor', bus: new Bus({ name: 'bus' }) });
    termFunction = <TermFunctionInternalBlankNode> await actor.run(<any> {});
  });

  it('should be registered under the internal blank node function name', () => {
    expect(termFunction.operator).toBe('internal://blank');
  });

  it('should give the same blank node for the same argument', () => {
    const evaluator = getMockInternalEvaluator();
    expect(termFunction.applyOnTerms([ new StringLiteral('address 1') ], evaluator))
      .toEqual(new BlankNode('internaladdress_20_1'));
    expect(termFunction.applyOnTerms([ new StringLiteral('address 1') ], evaluator))
      .toEqual(new BlankNode('internaladdress_20_1'));
    expect(termFunction.applyOnTerms([ new NamedNode('ex:a') ], evaluator))
      .toEqual(new BlankNode('internalex_3a_a'));
  });

  it('should give different labels for arguments that differ in special characters only', () => {
    expect(TermFunctionInternalBlankNode.getBlankNodeLabel('a b'))
      .not.toBe(TermFunctionInternalBlankNode.getBlankNodeLabel('a_b'));
    expect(TermFunctionInternalBlankNode.getBlankNodeLabel('a_20_b'))
      .not.toBe(TermFunctionInternalBlankNode.getBlankNodeLabel('a b'));
  });
});
