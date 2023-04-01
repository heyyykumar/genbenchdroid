const { escapeRegExp } = require('../helpers/RegexHelper');
const { concatIfNotNull } = require('../helpers/ArrayHelper');
const ConfigHandler = require('./ConfigHandler');
const md5=require("md5");
class Preprocessor {
    identifierCount = 0;
    multiFlowIdentifier = {
        module: 0,
        methods: 0,
        globals: 0
    };
    moduleCount = 0;
    addedData = { imports: [], permissions: [] };
    moduleIdentifiers = [];

    preprocessTemplate(template) {

        let processedTemplate = {
            ...template,
            template: this._joinCodeSnippet(template.template),
            manifest: this._joinCodeSnippet(template.manifest),
            layout: this._joinCodeSnippet(template.layout)
        };

        return processedTemplate;
    }

    preprocessModule(module, parentId, childId, id) {

        let processedModule = { 
            ...module, 
            parentId,
            childId,
            id,
            imports: this._joinCodeSnippet(this._filterAlreadyContained(module.imports, 'imports')),
            globals: this._joinCodeSnippet(module.globals),
            module: this._joinCodeSnippet(module.module),
            methods: this._joinCodeSnippet(module.methods),
            classes: this._joinCodeSnippet(module.classes),
            permissions: this._joinCodeSnippet(this._filterAlreadyContained(module.permissions, 'permissions')),
            components: this._joinCodeSnippet(module.components),
            views: this._joinCodeSnippet(module.views),
            project: new ConfigHandler().get('projectName')
        };

        // add comment to later identify linenubmer of statement
        processedModule = this._attachModuleId(processedModule);

        // give identifiers numbers after the name so that there are no multiple identifier usages
        processedModule = this._handleIdentifiers(processedModule);

        // insert a placeholder into the module if the specific field is empty
        processedModule = this._handleEmptyPlaceholders(processedModule);
        
        // insert a new placeholder so that the one in the template is not consumed
        processedModule = this._handleImportPlaceholder(processedModule);
        processedModule = this._handleManifestAndLayoutPlaceholders(processedModule);


        // change module field name and placeholder so that the modules are inserted in the correct order and 
        // no module is inserted multiple times because there are multiple empty {{ module }} placeholders
        // inside the template
        processedModule = this._handleModuleInsertionPlaceholder(processedModule);
        
        // retain {{ module }} placeholders that have not been inserted yet
        processedModule = this._retainPlaceholders(processedModule);

        this.multiFlowIdentifier.module = 0;
        this.multiFlowIdentifier.methods = 0;
        this.multiFlowIdentifier.globals = 0;
        this.moduleCount++;

        return processedModule;
    }

    _joinCodeSnippet(codeSnippetArray) {
        if (codeSnippetArray) {
            return codeSnippetArray.join('\n');
        }
        return '';
    }

    _attachModuleId(module) {
        if (!module.flows || !module.flows.length > 0) return module;
        
        const statmentSiganture = module.flows[0].statementSignature;
        if (!statmentSiganture) return module;

        const methodNameWithParameters = statmentSiganture.split(/(\s+)/).pop();
        const methodName = methodNameWithParameters.match(/[^\(]*/gm)[0];
        const methodNameRegex = new RegExp(`(${methodName}.*)`);

        const placeholdersToReplace = ['module', 'methods', 'classes'];
        for (const placeholder of placeholdersToReplace) {
            const replaceContent = module[placeholder].replace(methodNameRegex, `$1 // statementId: ${module.id}`);
            if (replaceContent !== module[placeholder]) {
                return  { ...module, [placeholder]: replaceContent };
            }
        }

        // nothing was replaced (no Id was attached)
        return module;
    }

    _obfuscateSensitiveDataIdentifier(module) {
        const refinedModule = { ...module };
        const sensitiveDataRegex = /(sensitiveData)\d*(_)\d*/gm;

        const findUniqueMatches = (string) => {
            const matchArray = string.match(sensitiveDataRegex) || [];
            const uniqueMatches = [...new Set(matchArray)];

            return uniqueMatches.reduce((acc, match) => {
                acc[match] = (acc[match] || 0) + 1;
                return acc;
            }, {});
        };



        for (const key of Object.keys(refinedModule)) {
            if (typeof refinedModule[key] === 'string') {
                let uniqueMatches = findUniqueMatches(refinedModule[key]);
                for(const uniqueKey of Object.keys(uniqueMatches)){
                    refinedModule[key] = refinedModule[key].split(uniqueKey).join('a'+md5(uniqueKey));

                }
            }
        }

        return refinedModule;
    }

    _handleIdentifiers(module) {
        const refinedModule = { ...module };
        const identifierRegex = /(?<=\§).*?(?=\$)/g;

        const identifiers = concatIfNotNull(
            refinedModule.globals.match(identifierRegex),
            refinedModule.module.match(identifierRegex),
            refinedModule.methods.match(identifierRegex),
            refinedModule.classes.match(identifierRegex),
            refinedModule.components.match(identifierRegex),
            refinedModule.views.match(identifierRegex)
        );

        // only get unique identifiers
        const uniqueIdentifiers = [... new Set(identifiers)];

        uniqueIdentifiers.forEach(identifier => {
            const newIdentifier = identifier + this.identifierCount;
            const replacer = new RegExp(escapeRegExp(`§${identifier}$`), 'g');
            refinedModule.globals  = refinedModule.globals.replace(replacer, newIdentifier);
            refinedModule.module  = refinedModule.module.replace(replacer, newIdentifier);
            refinedModule.methods  = refinedModule.methods.replace(replacer, newIdentifier);
            refinedModule.classes  = refinedModule.classes.replace(replacer, newIdentifier);
            refinedModule.components  = refinedModule.components.replace(replacer, newIdentifier);
            refinedModule.views  = refinedModule.views.replace(replacer, newIdentifier);

            // handle identifiers in flow
            refinedModule.flows.forEach((flow, idx) => {
                refinedModule.flows[idx].className = flow.className.replace(replacer, newIdentifier);
                refinedModule.flows[idx].methodSignature = flow.methodSignature.replace(replacer, newIdentifier);
            });

            this.identifierCount++;
        });

        return refinedModule;
    }

    _handleImportPlaceholder(module) {
        const refinedModule = { ...module };
        // check if data flow changed to different class
        if (!/{{\s*imports\s*}}/.test(refinedModule.classes)) {
            // if not
            refinedModule.imports += '{{ imports }}';
        }
        return refinedModule;
    }

    _handleManifestAndLayoutPlaceholders(module) {
        const refinedModule = { ...module };
        const placeholdersToCheck = ['permissions', 'components', 'views'];
        placeholdersToCheck.forEach(placeholder => {
            const regexToCheck = new RegExp(`{{\\s*${placeholder}\\s*}}`);
            if (!regexToCheck.test(refinedModule[placeholder])) {
                refinedModule[placeholder] += `\n{{ ${placeholder} }}`;
            }
        });

        return refinedModule;
    }

    _handleEmptyPlaceholders(module) {
        const refinedModule = { ...module };
        const placeholdersToCheck = ['permissions', 'components', 'views'];
        placeholdersToCheck.forEach(placeholder => {
            if (!refinedModule[placeholder]) {
                refinedModule[placeholder] += `{{ ${placeholder} }}`;
            }
        });

        return refinedModule;
    }

    _handleModuleInsertionPlaceholder(module) {
        const refinedModule = { ...module };
        const placeholdersToCheck = ['module', 'methods', 'globals'];

        placeholdersToCheck.forEach(placeholder => {
            const placeholderRegexGlobal = new RegExp(`{{\\s*${placeholder}\\s*}}`, 'g');
            const placeholderRegexSingle = new RegExp(`{{\\s*${placeholder}\\s*}}`);

            const insertionPlaceholders = concatIfNotNull(
                refinedModule.module.match(placeholderRegexGlobal),
                refinedModule.methods.match(placeholderRegexGlobal),
                refinedModule.classes.match(placeholderRegexGlobal),
                refinedModule.globals.match(placeholderRegexGlobal)
            );

            insertionPlaceholders.forEach(_ => {
                refinedModule.module = refinedModule.module.replace(placeholderRegexSingle, `{{ ${placeholder}${module.id}${this.multiFlowIdentifier[placeholder]} }}`);
                refinedModule.methods = refinedModule.methods.replace(placeholderRegexSingle, `{{ ${placeholder}${module.id}${this.multiFlowIdentifier[placeholder]} }}`);
                refinedModule.classes = refinedModule.classes.replace(placeholderRegexSingle, `{{ ${placeholder}${module.id}${this.multiFlowIdentifier[placeholder]} }}`);
                refinedModule.globals = refinedModule.globals.replace(placeholderRegexSingle, `{{ ${placeholder}${module.id}${this.multiFlowIdentifier[placeholder]} }}`);
                this.multiFlowIdentifier[placeholder] += 1;
            });
        });
      
        if (this.moduleCount > 0) {
            placeholdersToCheck.forEach(placeholder => {
                const placeholderValue = refinedModule[placeholder];
                delete refinedModule[placeholder];
                refinedModule[`${placeholder}${module.parentId}${module.childId}`] = placeholderValue;
            });
        }

        return refinedModule;
    }

    _retainPlaceholders(module) {
        const refinedModule = { ...module };
        const placeholdersToRetain = ['module', 'methods', 'globals'];
        placeholdersToRetain.forEach(placeholder => {
            if (!refinedModule[placeholder]) {
                refinedModule[placeholder] = `{{ ${placeholder} }}`;
            }

            this.moduleIdentifiers.forEach(i => {
                if (!refinedModule[`${placeholder}${i}`]) {
                    refinedModule[`${placeholder}${i}`] = `{{ ${placeholder}${i} }}`;
                }
            });
        });

        // remove already included placeholders from tracked set
        const index = this.moduleIdentifiers.indexOf(`${module.parentId}${module.childId}`);
        if (index !== -1) {
            this.moduleIdentifiers.splice(index, 1);
        }

        return refinedModule;
    }

    _filterAlreadyContained(moduleData, key) {
        let filteredModuleData = [];
        if (moduleData instanceof Array) {
            moduleData.forEach(element => {
                if (this.addedData[key] && !this.addedData[key].includes(element)) {
                    this.addedData[key].push(element);
                    filteredModuleData.push(element);
                }
            });
        }
        return filteredModuleData;
    }
   
}

module.exports = Preprocessor;