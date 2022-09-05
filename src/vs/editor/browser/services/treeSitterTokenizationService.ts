/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Language, init } from 'web-tree-sitter';
import { createDecorator, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { IModelService } from 'vs/editor/common/services/model';
import { FileAccess } from 'vs/base/common/network';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { TreeSitterParseTree } from './treeSitterParserTree';
import { Iterable } from 'vs/base/common/iterator';

export interface ITreeSitterTokenizationService {
	registerModelTrees(): void;
}

const ITreeSitterTokenizationService = createDecorator<ITreeSitterTokenizationService>('ITreeSitterTokenizationService');

class TreeSitterTokenizationService implements ITreeSitterTokenizationService {

	private _language: Language | undefined;
	private readonly _disposableStore: DisposableStore = new DisposableStore();
	private readonly _modelTrees: TreeSitterParseTree[] = [];

	// TODO: When I place the editor inside of the constructor, this throws an error, so presumably I don't need to use the editor
	constructor(
		@IModelService private readonly _modelService: IModelService
	) {

		init({
			locateFile(_file: string, _folder: string) {
				const value = FileAccess.asBrowserUri('../../../../../node_modules/web-tree-sitter/tree-sitter.wasm', require).toString(true);
				return value;
			}
		}).then(async () => {
			const url = FileAccess.asBrowserUri('./tree-sitter-typescript.wasm', require).toString(true);
			const result = await fetch(url);
			const langData = new Uint8Array(await result.arrayBuffer());
			this._language = await Language.load(langData);

			// Registering the initial models
			this.registerModelTrees();
			this._disposableStore.add(_modelService.onModelAdded((model) => {
				if (model.getLanguageId() === 'typescript' && this._language) {
					this._modelTrees.push(new TreeSitterParseTree(model, this._language));
				}
			}));
			this._disposableStore.add(_modelService.onModelRemoved((model) => {
				if (model.getLanguageId() === 'typescript') {
					const treeSitterTreeToDispose = Iterable.find(this._modelTrees, tree => tree.id === model.id);
					if (treeSitterTreeToDispose) {
						treeSitterTreeToDispose.dispose();
					}
				}
			}));
		});
	}

	registerModelTrees() {
		const models = this._modelService.getModels();
		for (const model of models) {
			if (model.getLanguageId() === 'typescript' && this._language) {
				this._modelTrees.push(new TreeSitterParseTree(model, this._language));
			}
		}
	}

	dispose(): void {
		this._disposableStore.dispose();
	}
}

registerSingleton(ITreeSitterTokenizationService, TreeSitterTokenizationService, true);

registerAction2(class extends Action2 {

	constructor() {
		super({ id: 'toggleTreeSitterTokenization', title: 'Toggle Tree-Sitter Tokenization', f1: true });
	}

	run(accessor: ServicesAccessor) {
		const treeSitterTokenizationService = accessor.get(ITreeSitterTokenizationService);
		treeSitterTokenizationService.registerModelTrees();
	}
});
