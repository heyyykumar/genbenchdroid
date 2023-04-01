const ConfigHandler = require('./ConfigHandler');
const { cleanup, writeFileWithContent, copyFile, hashFile, _directoryExists } = require('../helpers/FileHelper');
const { create } = require('xmlbuilder2');
const { resolve } = require('path');

class FileGenerator {
    manifestContent = '';
    layoutContent = '';
    config = '';

    constructor (manifest, layout, classes, config) {
        this.manifestContent = manifest;
        this.layoutContent = layout;
        this.classes = classes;
        this.config = config;

        // write Android SDK path into build config
        const androidSdkDir = new ConfigHandler().get('androidSdkDir');
        writeFileWithContent('generated/local.properties', `sdk.dir=${androidSdkDir}`);
    }

    generateSourceFiles() {
        const mainPath = 'generated/app/src/main';
        const projectName = new ConfigHandler().get('projectName').split('.');

        // remove previously generated files
        this._cleanupDirectories(mainPath);

        // generate AndroidManifest.xml
        writeFileWithContent(`${mainPath}/AndroidManifest.xml`, this.manifestContent);

        // generate activity.xml layout file
        writeFileWithContent(`${mainPath}/res/layout/activity.xml`, this.layoutContent);

        // generate all necessary java files containing classes
        this.classes.forEach(elem => {
            writeFileWithContent(`${mainPath}/java/${projectName.join('/')}/${elem.className}.java`, elem.classContent);
        });
    }

    async finishCompilation(taintFlows, fullFlows, linenumberLookup, uncompiled = false, directOutput = false, configFile, cb = () => {}) {
        const date = new Date();
        const outputDir = new ConfigHandler().get('outputDir');

        let finalOutputDir;

        if(configFile) {
            const filteredConfig=configFile.replace(/\//g, '-');
            finalOutputDir=`${outputDir}/${filteredConfig}`;

            // if the build exists with the same name, adds the time stamp to new build
            if(_directoryExists(finalOutputDir)){
                finalOutputDir=`${finalOutputDir}-${date.getFullYear()}_${date.getMonth()+1}_${date.getDate()}_${date.getTime()}`;
            }

        }
        else
            finalOutputDir = directOutput ? outputDir : `${outputDir}/${date.getFullYear()}_${date.getMonth()+1}_${date.getDate()}_${date.getTime()}`;

        let apkFileName = `${finalOutputDir}/generated-app.apk`;

        // copy compiled APK file to the specified output directory
        if(!uncompiled){
        copyFile('generated/app/build/outputs/apk/debug/app-debug.apk', apkFileName);}
        else{apkFileName=false;}

        // copy source code to output directory
        copyFile('generated/app/src', `${finalOutputDir}/src`);
        copyFile('generated/app/build.gradle',`${finalOutputDir}/build.gradle`);
        copyFile('generated/app/proguard-rules.pro',`${finalOutputDir}/proguard-rules.pro`);



        // generate config description
        writeFileWithContent(`${finalOutputDir}/app-config.txt`, this.config);

        // generate ground-truth
        const groundTruthContent = await this._generateGroundTruthContent(taintFlows, apkFileName, linenumberLookup);
        writeFileWithContent(`${finalOutputDir}/ground-truth.xml`, groundTruthContent);

        // generate full flow ground-truth
        const fullGroundTruthContent = await this._generateGroundTruthContent(fullFlows, apkFileName, linenumberLookup);
        writeFileWithContent(`${finalOutputDir}/full-ground-truth.xml`, fullGroundTruthContent);

        cb();
    }

    _cleanupDirectories(path) {
        cleanup(`${path}/AndroidManifest.xml`);
        cleanup(`${path}/res/layout`);
        cleanup(`${path}/java`);
    }

    async _generateGroundTruthContent(taintFlows, apkFilePath, linenumberLookup) {
        const projectName = new ConfigHandler().get('projectName');
        const resolvedApkFilePath = apkFilePath ? resolve(apkFilePath).replace(/\\/g, '/') : '';
        const md5 = apkFilePath ? await hashFile(apkFilePath, 'md5') : '';
        const sha1 = apkFilePath ? await hashFile(apkFilePath, 'sha1') : '';
        const sha256 = apkFilePath ? await hashFile(apkFilePath, 'sha256'): '';

        const groundTruth = {
            answer: {
                flows: {
                    flow: []
                }
            }
        };

        const appField = {
            file: resolvedApkFilePath,
            hashes: {
                hash: [
                    {
                        '@type': 'MD5',
                        '#': md5
                    },
                    {
                        '@type': 'SHA-1',
                        '#': sha1
                    },
                    {
                        '@type': 'SHA-256',
                        '#': sha256
                    }
                ]
            }
        }

        groundTruth.answer.flows.flow = taintFlows.map(taintFlow => (
            {
                reference: [
                    {
                        '@type': 'from',
                        statement: {
                            statementfull: "",
                            statementgeneric: this._insertProject(taintFlow.from.statementSignature, projectName, taintFlow.from.className),
                            linenumber: linenumberLookup[taintFlow.from.id] ?? 0
                        },
                        method: `<${projectName}.${taintFlow.from.className}: ${taintFlow.from.methodSignature}>`,
                        classname: `${projectName}.${taintFlow.from.className}`,
                        app: appField
                    },
                    {
                        '@type': 'to',
                        statement: {
                            statementfull: "",
                            statementgeneric: this._insertProject(taintFlow.to.statementSignature, projectName, taintFlow.to.className),
                            linenumber: linenumberLookup[taintFlow.to.id] ?? 0
                        },
                        method: `<${projectName}.${taintFlow.to.className}: ${taintFlow.to.methodSignature}>`,
                        classname: `${projectName}.${taintFlow.to.className}`,
                        app: appField
                    }
                ],
                attributes: {
                    attribute: [
                        {
                            name: 'leaking',
                            value: taintFlow.to.leaking
                        },
                        {
                            name: 'reachable',
                            value: taintFlow.to.reachable
                        }
                    ]
                }
            }
        ));

        const groundTruthDoc = create({ encoding: 'UTF-8', standalone: 'yes' }, groundTruth);
        return groundTruthDoc.end({prettyPrint: true});
    }

    _insertProject(statement, projectName, className) {
        const projectRegex = /{{\s*project\s*}}/;

        if (!statement.match(projectRegex)) return statement;

        const colonIndex = statement.indexOf(':');

        const classNameInsertedStatement = `${statement.slice(0, colonIndex)}.${className}${statement.slice(colonIndex)}`;
        return classNameInsertedStatement.replace(projectRegex, projectName);
    };

    log() {
        console.log('\x1b[33m%s\x1b[0m', '--------- ANDROID MANIFEST --------');
        console.log(this.manifestContent);
        console.log('\x1b[33m%s\x1b[0m', '--------- LAYOUT --------');
        console.log(this.layoutContent);
        console.log('\x1b[33m%s\x1b[0m', '--------- SOURCE CODE --------');
        this.classes.forEach(elem => {
            console.log('\x1b[33m%s\x1b[0m', elem.className);
            console.log(elem.classContent);
        });
    }
}

module.exports = FileGenerator;