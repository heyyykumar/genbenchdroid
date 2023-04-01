const Fuzzer = require('./Fuzzer');
const Preprocessor = require('./Preprocessor');
const FlowProcessor = require('./FlowProcessor');
const TemplateEngine = require('./TemplateEngine');
const FileGenerator = require('./FileGenerator');
const ConfigHandler = require('./ConfigHandler');
const ErrorHandler = require('./Errors/ErrorHandler');
const DuplicateFileError = require('./Errors/DuplicateFileError');
const ConfigError = require('./Errors/ConfigError');
const {readJson, checkForFilenameDuplicates, loadFileUsingGlob} = require('../helpers/FileHelper');
const {parseTree, BFS} = require('../helpers/TreeHelper');
const {runGradle} = require('../helpers/ProcessHelper');
const {removeModuleNumber, getModuleNumber} = require("../helpers/RegexHelper");
const {addModuleNumber, sortByNumber, tmcList} = require("../helpers/StringHelper");
const fs = require("fs");
const cliProgress = require('cli-progress');
const Console = require("console");

class GBD {
    argv = {};
    progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    totalModuleCount = 0;
    varUniversalTrack = {};
    coreTemplate = {
        templateStringElementList: ["imports", "globals", "module", "methods", "classes"],
        manifestStringElementList: ["permissions", "components"],
        layoutStringElementList: ["views"]
    };

    constructor(argv) {
        this.argv = argv;
        this.moduleDir = new ConfigHandler().get('moduleDir');
    }

    async run() {
        try {
            Console.time("Grammar and Module Verification took");
            this._duplicateFileCheck();
            // get TMC
            const forbidden = new ConfigHandler().get('forbidden');
            const fuzzer = new Fuzzer('../../grammar/grammar', forbidden);
            const {tmc, tmcString} = this._getTMC(this.argv, fuzzer);
            Console.timeEnd("Grammar and Module Verification took");

            this._reportModuleCount(tmc);

            Console.time("Source-files generation took");
            // load template from TMC
            const templateName = tmc.shift();
            const template = this._loadTemplate(removeModuleNumber(templateName));

            // initialize preprocessor and preprocess template
            const pre = new Preprocessor();
            const processedTemplate = pre.preprocessTemplate(template);

            // initialize template engine
            const te = new TemplateEngine(processedTemplate);

            // parse, load and preprocess modules from TMC
            const moduleTree = parseTree(tmc);


            this.progressBar.start(this.totalModuleCount, 0);

            BFS(moduleTree, (module, id) => {
                this._processModule(pre, te, module, id);
                this.progressBar.increment()
            });

            this.progressBar.stop();


            // process and generate taint flows for ground-truth
            const fp = new FlowProcessor(processedTemplate);
            // process template and calculate: leaking and reachable

            const flowSeriesTMCDict = sortByNumber(tmcList(tmcString));
            for (const tKey in flowSeriesTMCDict) {
                fp.processFlows(moduleTree, flowSeriesTMCDict[tKey]);
            }

            let sourceSinkConnections = [];
            for (const tKey in flowSeriesTMCDict) {
                const connection = fp.getSourceSinkConnections(moduleTree, flowSeriesTMCDict[tKey]);
                Array.prototype.push.apply(sourceSinkConnections, connection);
            }

            let allConnections = [];
            for (const tKey in flowSeriesTMCDict) {
                const allCon = fp.getAllConnections(moduleTree, flowSeriesTMCDict[tKey]);
                Array.prototype.push.apply(allConnections, allCon);
            }

            // finish source generation and obtain source contents before writing to file
            te.finishSourceGeneration();
            const {manifest, layout, classes} = te.getSourceContents();
            const linenumberLookup = te.createLinenumberLookup();

            // generate the source files
            const fg = new FileGenerator(manifest, layout, classes, tmcString);
            fg.generateSourceFiles();
            Console.timeEnd("Source-files generation took");
            this._log('Completed: Source-code generation');

            // check for uncompiled flag and either compile or just move source files
            const successCb = () => this._log('Benchmark case has been successfully generated');

            await this._finishGeneration(this.argv.uncompiled, () => fg.finishCompilation(sourceSinkConnections, allConnections, linenumberLookup, this.argv.uncompiled, this.argv.directOutput, this.argv.configFile, successCb));
        } catch (err) {
            const errorHandler = new ErrorHandler();
            errorHandler.handleError(err);
        }
    }

    _reportModuleCount(array) {
        const counts = {};

        for (let str of array) {
            // Check if string contains only '(' or ')' characters
            if (/^[()]+$/.test(str)) {
                continue;
            }

            // Remove any number suffix from string
            str = str.replace(/\d+$/, '');

            // Increment count for string
            if (counts[str]) {
                counts[str]++;
            } else {
                counts[str] = 1;
            }
        }

        let totalModuleSum = 0;
        for (const key in counts) {
            totalModuleSum += counts[key];
        }

        this.totalModuleCount = totalModuleSum;

        this._log('Total module count: { ' + totalModuleSum + ' }');

        this._log("Module count description:", counts);
    }

    // check for duplicate file names
    _duplicateFileCheck() {
        const duplicates = checkForFilenameDuplicates(this.moduleDir);
        if (duplicates?.length) {
            throw new DuplicateFileError(duplicates, 'Multiple Files have the same file name');
        }
    }

    // parse or generate TMC tree
    _getTMC(argv, fuzzer) {
        const {config, configFile, fuzz, maxLength, minLength, taintflow, contains, ignore, priority} = argv;
        let tmcString;
        let configuration = config;

        if (!config && !fuzz && !configFile) {
            throw new ConfigError('You either have to provide a template/modules configuration or activate the fuzzing mode');
        }
        if (!config && configFile) {
            configuration = fs.readFileSync(configFile).toString('utf-8');
        }

        if (configuration) {
            // format the config string
            tmcString = configuration.trim().replace(/\s\s+/g, ' ');
            // verify the configString without module number

            if (!fuzzer.verify(tmcString.replace(/\d+\s|\d+$/g, ' ').replace(/\s+$/g, ''))) {
                // invalid configuration
                throw new ConfigError('Invalid Template/Module Configuration (TMC) provided');
            }
        } else if (fuzz) {
            tmcString = fuzzer.fuzz({maxLength, minLength, taintflow, contains, ignore, priority});
            if (!tmcString) {
                throw new ConfigError('Could not generate a proper Template/Modules Configuration (TMC)');
            }
            this._log('Generated Template/Module Configuration (TMC):', `--- ${tmcString} ---`);
        }

        const tmc = tmcString.split(/\s+|(\(|\))/g).filter(elem => elem);
        return {tmc, tmcString};
    }

    // load template data from corresponding file
    _loadTemplate(templateName) {
        const templateDir = new ConfigHandler().get('templateDir');
        const templateFile = loadFileUsingGlob(templateDir, `${templateName}.json`);
        return readJson(templateFile);

    }

    // process each module one by one
    // 1. load module
    // 2. preprocess module
    // 3. insert module into template
    _processModule(pre, te, module, id) {
        const moduleName = module.module;
        if (!module || !moduleName || moduleName === 'empty') return;
        const moduleNumber = getModuleNumber(moduleName);
        // use glob to load the module from arbitrary subdir inside module dir

        // load module without id
        const moduleFile = loadFileUsingGlob(this.moduleDir, `${removeModuleNumber(moduleName)}.json`);
        const moduleData = readJson(moduleFile);

        module.type = moduleData.type;
        module.flows = moduleData.flows;
        module.id = id;


        let varPass = 0;
        let varSet = {};

        if (!(typeof this.varUniversalTrack[module.parentId] === 'undefined')) varSet = {...this.varUniversalTrack[module.parentId]};

        if (moduleData.pattern === 'OUT') {
            if (module.type === 'SOURCE') {
                varSet[moduleNumber] = id;
                varPass = id;
            } else {
                varPass = varSet[moduleNumber];
                varSet[moduleNumber] = id;
            }
        } else if (moduleData.pattern === 'IN') {
            varPass = varSet[moduleNumber];
        }

        // track variable modification
        this.varUniversalTrack[module.id] = varSet;


        module.children.forEach((child, idx) => {
            child.parentId = id;
            child.childId = idx;
            pre.moduleIdentifiers.push(`${id}${idx}`);
        });

        // add module number to each variable: IN: sensitiveData_€ and OUT: sensitiveData_₹
        for (const moduleKey in moduleData) {
            if (Array.isArray(moduleData[moduleKey])) {
                moduleData[moduleKey].forEach(function (part, index) {
                    if (typeof this[index] === "string" && this[index].length > 17) this[index] = addModuleNumber(this[index], moduleNumber, varPass, id);
                }, moduleData[moduleKey]); // moduleData as this
            }
        }


        const processedModule = pre.preprocessModule(moduleData, module.parentId, module.childId, module.id);

        const templateScriptModule = this.filterObjectByPatterns(processedModule, this.coreTemplate.templateStringElementList);
        const manifestTemplateScriptModule = this.filterObjectByPatterns(processedModule, this.coreTemplate.manifestStringElementList);
        const layoutTemplateScriptModule = this.filterObjectByPatterns(processedModule, this.coreTemplate.layoutStringElementList);

        this.addTemplateParallely(te, templateScriptModule, manifestTemplateScriptModule, layoutTemplateScriptModule);
    }

    async addTemplateParallely(te, templateScriptModule, manifestTemplateScriptModule, layoutTemplateScriptModule) {
        await Promise.all([te.insertModuletemplateScript(templateScriptModule), te.insertModulemanifestTemplateScript(manifestTemplateScriptModule), te.insertModulelayoutTemplateScript(layoutTemplateScriptModule)]);

    }

    filterObjectByPatterns(object, patterns) {
        const filteredObject = {};

        for (const [key, value] of Object.entries(object)) {
            for (const pattern of patterns) {
                if (key.includes(pattern)) {
                    filteredObject[key] = value;
                    break;
                }
            }
        }

        return filteredObject;
    }

    // run gradle to compile and generate the ground-truth if successfull
    _finishGeneration(uncompiled, finishFunction) {
        return new Promise((resolve, reject) => {
            if (uncompiled) {
                finishFunction();
                resolve();
            } else {
                this._log('Starting compilation process');
                runGradle(() => finishFunction());
                resolve();
            }
        });
    }

    _log(...args) {
        args.forEach(string => {
            console.log('\x1b[33m%s\x1b[0m', string);
        });
    }
}

module.exports = GBD;