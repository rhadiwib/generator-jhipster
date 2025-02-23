/**
 * Copyright 2013-2021 the original author or authors from the JHipster project.
 *
 * This file is part of the JHipster project, see https://www.jhipster.tech/
 * for more information.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const path = require('path');
const _ = require('lodash');
const Generator = require('yeoman-generator');
const chalk = require('chalk');
const shelljs = require('shelljs');
const semver = require('semver');
const exec = require('child_process').exec;
const https = require('https');
const filter = require('gulp-filter');
const through = require('through2');
const fs = require('fs');
const minimatch = require('minimatch');
const findUp = require('find-up');
const prettierPluginJava = require('prettier-plugin-java');
const prettierPluginPackagejson = require('prettier-plugin-packagejson');

const packagejs = require('../package.json');
const jhipsterUtils = require('./utils');
const constants = require('./generator-constants');
const { defaultConfig } = require('./generator-defaults');
const { languageToJavaLanguage } = require('./utils');
const { prettierTransform, generatedAnnotationTransform } = require('./generator-transforms');
const JSONToJDLEntityConverter = require('../jdl/converters/json-to-jdl-entity-converter');
const JSONToJDLOptionConverter = require('../jdl/converters/json-to-jdl-option-converter');
const { prepareEntityForTemplates, loadRequiredConfigIntoEntity } = require('../utils/entity');
const { prepareFieldForTemplates } = require('../utils/field');
const { formatDateForChangelog, prepareFieldForLiquibaseTemplates } = require('../utils/liquibase');
const { stringify } = require('../utils');

const SERVER_TEST_SRC_DIR = constants.SERVER_TEST_SRC_DIR;
const ANGULAR = constants.SUPPORTED_CLIENT_FRAMEWORKS.ANGULAR;
const REACT = constants.SUPPORTED_CLIENT_FRAMEWORKS.REACT;
const VUE = constants.SUPPORTED_CLIENT_FRAMEWORKS.VUE;

/**
 * This is the Generator base private class.
 * This provides all the private API methods used internally.
 * These methods should not be directly utilized using commonJS require,
 * as these can have breaking changes without a major version bump
 *
 * The method signatures in private API can be changed without a major version change.
 */
module.exports = class JHipsterBasePrivateGenerator extends Generator {
    constructor(args, opts) {
        super(args, opts);
        // expose lodash to templates
        this._ = _;
    }

    /* ======================================================================== */
    /* private methods use within generator (not exposed to modules) */
    /* ======================================================================== */

    /**
     * Override yeoman generator's usage function to fine tune --help message.
     */
    usage() {
        return super.usage().replace('yo jhipster:', 'jhipster ');
    }

    /**
     * Override yeoman generator's destinationPath to apply custom output dir.
     */
    destinationPath(...paths) {
        paths = path.join(...paths);
        paths = this.applyOutputPathCustomizer(paths);
        return paths ? super.destinationPath(paths) : paths;
    }

    /**
     * Install I18N Client Files By Language
     *
     * @param {any} _this reference to generator
     * @param {string} webappDir web app directory
     * @param {string} lang language code
     */
    installI18nClientFilesByLanguage(_this, webappDir, lang) {
        const generator = _this || this;
        const prefix = this.fetchFromInstalledJHipster('languages/templates');
        if (generator.applicationType === 'gateway' && generator.serviceDiscoveryType) {
            generator.copyI18nFilesByName(generator, webappDir, 'gateway.json', lang);
        }
        if (generator.withAdminUi) {
            generator.copyI18nFilesByName(generator, webappDir, 'configuration.json', lang);
            generator.copyI18nFilesByName(generator, webappDir, 'logs.json', lang);
            generator.copyI18nFilesByName(generator, webappDir, 'metrics.json', lang);
        }
        generator.copyI18nFilesByName(generator, webappDir, 'error.json', lang);
        generator.copyI18nFilesByName(generator, webappDir, 'login.json', lang);
        generator.copyI18nFilesByName(generator, webappDir, 'home.json', lang);
        generator.copyI18nFilesByName(generator, webappDir, 'password.json', lang);
        generator.copyI18nFilesByName(generator, webappDir, 'register.json', lang);
        generator.copyI18nFilesByName(generator, webappDir, 'sessions.json', lang);
        generator.copyI18nFilesByName(generator, webappDir, 'settings.json', lang);
        generator.copyI18nFilesByName(generator, webappDir, 'user-management.json', lang);

        // tracker.json for Websocket
        if (this.websocket === 'spring-websocket') {
            generator.copyI18nFilesByName(generator, webappDir, 'tracker.json', lang);
        }

        // Templates
        generator.template(`${prefix}/${webappDir}i18n/${lang}/activate.json.ejs`, `${webappDir}i18n/${lang}/activate.json`);
        generator.template(`${prefix}/${webappDir}i18n/${lang}/global.json.ejs`, `${webappDir}i18n/${lang}/global.json`);
        if (generator.withAdminUi) {
            generator.template(`${prefix}/${webappDir}i18n/${lang}/health.json.ejs`, `${webappDir}i18n/${lang}/health.json`);
        }
        generator.template(`${prefix}/${webappDir}i18n/${lang}/reset.json.ejs`, `${webappDir}i18n/${lang}/reset.json`);
    }

    /**
     * Install I18N Server Files By Language
     *
     * @param {any} _this - reference to generator
     * @param {string} resourceDir - resource directory
     * @param {string} lang - language code
     */
    installI18nServerFilesByLanguage(_this, resourceDir, lang, testResourceDir) {
        const generator = _this || this;
        const prefix = this.fetchFromInstalledJHipster('languages/templates');
        const langJavaProp = languageToJavaLanguage(lang);
        generator.template(
            `${prefix}/${resourceDir}i18n/messages_${langJavaProp}.properties.ejs`,
            `${resourceDir}i18n/messages_${langJavaProp}.properties`
        );
        generator.template(
            `${prefix}/${testResourceDir}i18n/messages_${langJavaProp}.properties.ejs`,
            `${testResourceDir}i18n/messages_${langJavaProp}.properties`
        );
    }

    /**
     * Copy I18N
     *
     * @param language
     * @param prefix
     */
    copyI18n(language, prefix = '') {
        try {
            const fileName = this.entityTranslationKey;
            this.template(
                `${prefix ? `${prefix}/` : ''}i18n/entity_${language}.json.ejs`,
                `${this.CLIENT_MAIN_SRC_DIR}i18n/${language}/${fileName}.json`
            );
            this.addEntityTranslationKey(
                this.entityTranslationKeyMenu,
                this.entityClassHumanized || _.startCase(this.entityClass),
                language
            );
        } catch (e) {
            this.debug('Error:', e);
            // An exception is thrown if the folder doesn't exist
            // do nothing
        }
    }

    /**
     * Copy Enum I18N
     *
     * @param language
     * @param enumInfo
     * @param prefix
     */
    copyEnumI18n(language, enumInfo, prefix = '') {
        try {
            this.template(
                `${prefix ? `${prefix}/` : ''}i18n/enum.json.ejs`,
                `${this.CLIENT_MAIN_SRC_DIR}i18n/${language}/${enumInfo.clientRootFolder}${enumInfo.enumInstance}.json`,
                this,
                {},
                enumInfo
            );
        } catch (e) {
            this.debug('Error:', e);
            // An exception is thrown if the folder doesn't exist
            // do nothing
        }
    }

    /**
     * Update Languages In Language Constant
     *
     * @param languages
     */
    updateLanguagesInLanguageConstant(languages) {
        const fullPath = `${this.CLIENT_MAIN_SRC_DIR}app/components/language/language.constants.js`;
        try {
            let content = ".constant('LANGUAGES', [\n";
            languages.forEach((language, i) => {
                content += `            '${language}'${i !== languages.length - 1 ? ',' : ''}\n`;
            });
            content +=
                '            // jhipster-needle-i18n-language-constant - JHipster will add/remove languages in this array\n        ]';

            jhipsterUtils.replaceContent(
                {
                    file: fullPath,
                    pattern: /\.constant.*LANGUAGES.*\[([^\]]*jhipster-needle-i18n-language-constant[^\]]*)\]/g,
                    content,
                },
                this
            );
        } catch (e) {
            this.log(
                chalk.yellow('\nUnable to find ') +
                    fullPath +
                    chalk.yellow(' or missing required jhipster-needle. LANGUAGE constant not updated with languages: ') +
                    languages +
                    chalk.yellow(' since block was not found. Check if you have enabled translation support.\n')
            );
            this.debug('Error:', e);
        }
    }

    /**
     * Update Languages In Language Constant NG2
     *
     * @param languages
     */
    updateLanguagesInLanguageConstantNG2(languages) {
        if (this.clientFramework !== ANGULAR) {
            return;
        }
        const fullPath = `${this.CLIENT_MAIN_SRC_DIR}app/config/language.constants.ts`;
        try {
            let content = 'export const LANGUAGES: string[] = [\n';
            languages.forEach((language, i) => {
                content += `    '${language}'${i !== languages.length - 1 ? ',' : ''}\n`;
            });
            content += '    // jhipster-needle-i18n-language-constant - JHipster will add/remove languages in this array\n];';

            jhipsterUtils.replaceContent(
                {
                    file: fullPath,
                    pattern: /export.*LANGUAGES.*\[([^\]]*jhipster-needle-i18n-language-constant[^\]]*)\];/g,
                    content,
                },
                this
            );
        } catch (e) {
            this.log(
                chalk.yellow('\nUnable to find ') +
                    fullPath +
                    chalk.yellow(' or missing required jhipster-needle. LANGUAGE constant not updated with languages: ') +
                    languages +
                    chalk.yellow(' since block was not found. Check if you have enabled translation support.\n')
            );
            this.debug('Error:', e);
        }
    }

    /**
     * Update Languages In MailServiceIT
     *
     * @param languages
     */
    updateLanguagesInLanguageMailServiceIT(languages, packageFolder) {
        const fullPath = `${SERVER_TEST_SRC_DIR}${packageFolder}/service/MailServiceIT.java`;
        try {
            let content = 'private static final String[] languages = {\n';
            languages.forEach((language, i) => {
                content += `        "${language}"${i !== languages.length - 1 ? ',' : ''}\n`;
            });
            content += '        // jhipster-needle-i18n-language-constant - JHipster will add/remove languages in this array\n    };';

            jhipsterUtils.replaceContent(
                {
                    file: fullPath,
                    pattern: /private.*static.*String.*languages.*\{([^}]*jhipster-needle-i18n-language-constant[^}]*)\};/g,
                    content,
                },
                this
            );
        } catch (e) {
            this.log(
                chalk.yellow('\nUnable to find ') +
                    fullPath +
                    chalk.yellow(' or missing required jhipster-needle. LANGUAGE constant not updated with languages: ') +
                    languages +
                    chalk.yellow(' since block was not found. Check if you have enabled translation support.\n')
            );
            this.debug('Error:', e);
        }
    }

    /**
     * Update Languages In Language Pipe
     *
     * @param languages
     */
    updateLanguagesInLanguagePipe(languages) {
        const fullPath =
            this.clientFramework === ANGULAR
                ? `${this.CLIENT_MAIN_SRC_DIR}app/shared/language/find-language-from-key.pipe.ts`
                : `${this.CLIENT_MAIN_SRC_DIR}/app/config/translation.ts`;
        try {
            let content = '{\n';
            this.generateLanguageOptions(languages, this.clientFramework).forEach((ln, i) => {
                content += `        ${ln}${i !== languages.length - 1 ? ',' : ''}\n`;
            });
            content += '        // jhipster-needle-i18n-language-key-pipe - JHipster will add/remove languages in this object\n    };';

            jhipsterUtils.replaceContent(
                {
                    file: fullPath,
                    pattern: /{\s*('[a-z-]*':)?([^=]*jhipster-needle-i18n-language-key-pipe[^;]*)\};/g,
                    content,
                },
                this
            );
        } catch (e) {
            this.log(
                chalk.yellow('\nUnable to find ') +
                    fullPath +
                    chalk.yellow(' or missing required jhipster-needle. Language pipe not updated with languages: ') +
                    languages +
                    chalk.yellow(' since block was not found. Check if you have enabled translation support.\n')
            );
            this.debug('Error:', e);
        }
    }

    /**
     * Update Languages In Webpack
     *
     * @param languages
     */
    updateLanguagesInWebpackAngular(languages) {
        const fullPath = 'webpack/webpack.custom.js';
        try {
            let content = 'groupBy: [\n';
            // prettier-ignore
            languages.forEach((language, i) => {
                content += `                    { pattern: "./${this.CLIENT_MAIN_SRC_DIR}i18n/${language}/*.json", fileName: "./i18n/${language}.json" }${
                    i !== languages.length - 1 ? ',' : ''
                }\n`;
            });
            content +=
                '                    // jhipster-needle-i18n-language-webpack - JHipster will add/remove languages in this array\n' +
                '                ]';

            jhipsterUtils.replaceContent(
                {
                    file: fullPath,
                    pattern: /groupBy:.*\[([^\]]*jhipster-needle-i18n-language-webpack[^\]]*)\]/g,
                    content,
                },
                this
            );
        } catch (e) {
            this.log(
                chalk.yellow('\nUnable to find ') +
                    fullPath +
                    chalk.yellow(' or missing required jhipster-needle. Webpack language task not updated with languages: ') +
                    languages +
                    chalk.yellow(' since block was not found. Check if you have enabled translation support.\n')
            );
            this.debug('Error:', e);
        }
    }

    /**
     * Update Languages In Webpack React
     *
     * @param languages
     */
    updateLanguagesInWebpackReact(languages) {
        const fullPath = 'webpack/webpack.common.js';
        try {
            let content = 'groupBy: [\n';
            // prettier-ignore
            languages.forEach((language, i) => {
                content += `                    { pattern: "./${this.CLIENT_MAIN_SRC_DIR}i18n/${language}/*.json", fileName: "./i18n/${language}.json" }${
                    i !== languages.length - 1 ? ',' : ''
                }\n`;
            });
            content +=
                '                    // jhipster-needle-i18n-language-webpack - JHipster will add/remove languages in this array\n' +
                '                ]';

            jhipsterUtils.replaceContent(
                {
                    file: fullPath,
                    pattern: /groupBy:.*\[([^\]]*jhipster-needle-i18n-language-webpack[^\]]*)\]/g,
                    content,
                },
                this
            );
        } catch (e) {
            this.log(
                chalk.yellow('\nUnable to find ') +
                    fullPath +
                    chalk.yellow(' or missing required jhipster-needle. Webpack language task not updated with languages: ') +
                    languages +
                    chalk.yellow(' since block was not found. Check if you have enabled translation support.\n')
            );
            this.debug('Error:', e);
        }
    }

    /**
     * Update DayJS Locales to keep in dayjs.ts config file
     *
     * @param languages
     */
    updateLanguagesInDayjsConfiguation(languages) {
        let fullPath = `${this.CLIENT_MAIN_SRC_DIR}app/config/dayjs.ts`;
        if (this.clientFramework === VUE) {
            fullPath = `${this.CLIENT_MAIN_SRC_DIR}app/shared/config/dayjs.ts`;
        } else if (this.clientFramework === ANGULAR) {
            fullPath = `${this.CLIENT_MAIN_SRC_DIR}app/config/dayjs.ts`;
        }
        try {
            const content = languages.reduce(
                (content, language) => `${content}import 'dayjs/locale/${this.getDayjsLocaleId(language)}'\n`,
                '// jhipster-needle-i18n-language-dayjs-imports - JHipster will import languages from dayjs here\n'
            );

            jhipsterUtils.replaceContent(
                {
                    file: fullPath,
                    // match needle until // DAYJS CONFIGURATION (excluded)
                    pattern: /\/\/ jhipster-needle-i18n-language-dayjs-imports[\s\S]+?(?=\/\/ DAYJS CONFIGURATION)/g,
                    content: `${content}\n`,
                },
                this
            );
        } catch (e) {
            this.log(
                chalk.yellow('\nUnable to find ') +
                    fullPath +
                    chalk.yellow(' or missing required jhipster-needle. DayJS language task not updated with languages: ') +
                    languages +
                    chalk.yellow(' since block was not found. Check if you have enabled translation support.\n')
            );
            this.debug('Error:', e);
        }
    }

    /**
     * Remove File
     *
     * @param file
     */
    removeFile(file) {
        file = this.destinationPath(file);
        if (file && shelljs.test('-f', file)) {
            this.log(`Removing the file - ${file}`);
            shelljs.rm(file);
        }
    }

    /**
     * Remove Folder
     *
     * @param folder
     */
    removeFolder(folder) {
        folder = this.destinationPath(folder);
        if (folder && shelljs.test('-d', folder)) {
            this.log(`Removing the folder - ${folder}`);
            shelljs.rm('-rf', folder);
        }
    }

    /**
     * Execute a git mv.
     *
     * @param {string} source
     * @param {string} dest
     * @returns {boolean} true if success; false otherwise
     */
    gitMove(source, dest) {
        source = this.destinationPath(source);
        dest = this.destinationPath(dest);
        if (source && dest && shelljs.test('-f', source)) {
            this.info(`Renaming the file - ${source} to ${dest}`);
            return !shelljs.exec(`git mv -f ${source} ${dest}`).code;
        }
        return true;
    }

    /**
     * @returns default app name
     */
    getDefaultAppName() {
        return /^[a-zA-Z0-9_]+$/.test(path.basename(process.cwd())) ? path.basename(process.cwd()) : 'jhipster';
    }

    /**
     * Format As Class Javadoc
     *
     * @param {string} text - text to format
     * @returns class javadoc
     */
    formatAsClassJavadoc(text) {
        return jhipsterUtils.getJavadoc(text, 0);
    }

    /**
     * Format As Field Javadoc
     *
     * @param {string} text - text to format
     * @returns field javadoc
     */
    formatAsFieldJavadoc(text) {
        return jhipsterUtils.getJavadoc(text, 4);
    }

    /**
     * Format As Api Description
     *
     * @param {string} text - text to format
     * @returns formatted api description
     */
    formatAsApiDescription(text) {
        if (!text) {
            return text;
        }
        const rows = text.split('\n');
        let description = this.formatLineForJavaStringUse(rows[0]);
        for (let i = 1; i < rows.length; i++) {
            // discard empty rows
            if (rows[i].trim() !== '') {
                // if simple text then put space between row strings
                if (!description.endsWith('>') && !rows[i].startsWith('<')) {
                    description += ' ';
                }
                description += this.formatLineForJavaStringUse(rows[i]);
            }
        }
        return description;
    }

    formatLineForJavaStringUse(text) {
        if (!text) {
            return text;
        }
        return text.replace(/"/g, '\\"');
    }

    /**
     * Format As Liquibase Remarks
     *
     * @param {string} text - text to format
     * @param {boolean} addRemarksTag - add remarks tag
     * @returns formatted liquibase remarks
     */
    formatAsLiquibaseRemarks(text, addRemarksTag = false) {
        if (!text) {
            return addRemarksTag ? '' : text;
        }
        const rows = text.split('\n');
        let description = rows[0];
        for (let i = 1; i < rows.length; i++) {
            // discard empty rows
            if (rows[i].trim() !== '') {
                // if simple text then put space between row strings
                if (!description.endsWith('>') && !rows[i].startsWith('<')) {
                    description += ' ';
                }
                description += rows[i];
            }
        }
        // escape & to &amp;
        description = description.replace(/&/g, '&amp;');
        // escape " to &quot;
        description = description.replace(/"/g, '&quot;');
        // escape ' to &apos;
        description = description.replace(/'/g, '&apos;');
        // escape < to &lt;
        description = description.replace(/</g, '&lt;');
        // escape > to &gt;
        description = description.replace(/>/g, '&gt;');
        return addRemarksTag ? ` remarks="${description}"` : description;
    }

    /**
     * Parse creationTimestamp option
     * @returns {number} representing the milliseconds elapsed since January 1, 1970, 00:00:00 UTC
     *                   obtained by parsing the given string representation of the creationTimestamp.
     */
    parseCreationTimestamp(creationTimestampOption = this.options.creationTimestamp) {
        let creationTimestamp;
        if (creationTimestampOption) {
            creationTimestamp = Date.parse(creationTimestampOption);
            if (!creationTimestamp) {
                this.warning(`Error parsing creationTimestamp ${creationTimestampOption}.`);
            } else if (creationTimestamp > new Date().getTime()) {
                this.error(`Creation timestamp should not be in the future: ${creationTimestampOption}.`);
            }
        }
        return creationTimestamp;
    }

    /**
     * @param {any} input input
     * @returns {boolean} true if input is number; false otherwise
     */
    isNumber(input) {
        if (isNaN(this.filterNumber(input))) {
            return false;
        }
        return true;
    }

    /**
     * @param {any} input input
     * @returns {boolean} true if input is a signed number; false otherwise
     */
    isSignedNumber(input) {
        if (isNaN(this.filterNumber(input, true))) {
            return false;
        }
        return true;
    }

    /**
     * @param {any} input input
     * @returns {boolean} true if input is a signed decimal number; false otherwise
     */
    isSignedDecimalNumber(input) {
        if (isNaN(this.filterNumber(input, true, true))) {
            return false;
        }
        return true;
    }

    /**
     * Filter Number
     *
     * @param {string} input - input to filter
     * @param isSigned - flag indicating whether to check for signed number or not
     * @param isDecimal - flag indicating whether to check for decimal number or not
     * @returns {number} parsed number if valid input; <code>NaN</code> otherwise
     */
    filterNumber(input, isSigned, isDecimal) {
        const signed = isSigned ? '(\\-|\\+)?' : '';
        const decimal = isDecimal ? '(\\.[0-9]+)?' : '';
        const regex = new RegExp(`^${signed}([0-9]+${decimal})$`);

        if (regex.test(input)) return Number(input);

        return NaN;
    }

    /**
     * Checks if git is installed.
     *
     * @param {function} callback[optional] - function to be called after checking if git is installed. The callback will receive the code of the shell command executed.
     *
     * @return {boolean} true if installed; false otherwise.
     */
    isGitInstalled(callback) {
        const gitInstalled = jhipsterUtils.isGitInstalled(callback);
        if (!gitInstalled) {
            this.warning('git is not found on your computer.\n', ` Install git: ${chalk.yellow('https://git-scm.com/')}`);
        }
        return gitInstalled;
    }

    /**
     * Get Option From Array
     *
     * @param {Array} array - array
     * @param {any} option - options
     * @returns {boolean} true if option is in array and is set to 'true'
     */
    getOptionFromArray(array, option) {
        let optionValue = false;
        array.forEach(value => {
            if (_.includes(value, option)) {
                optionValue = value.split(':')[1];
            }
        });
        optionValue = optionValue === 'true' ? true : optionValue;
        return optionValue;
    }

    /**
     * Function to issue a https get request, and process the result
     *
     *  @param {string} url - the url to fetch
     *  @param {function} onSuccess - function, which gets called when the request succeeds, with the body of the response
     *  @param {function} onFail - callback when the get failed.
     */
    httpsGet(url, onSuccess, onFail) {
        https
            .get(url, res => {
                let body = '';
                res.on('data', chunk => {
                    body += chunk;
                });
                res.on('end', () => {
                    onSuccess(body);
                });
            })
            .on('error', onFail);
    }

    /**
     * Function to print a proper array with simple quoted strings
     *
     *  @param {array} array - the array to print
     */
    toArrayString(array) {
        return `['${array.join("', '")}']`;
    }

    /**
     * Strip margin indicated by pipe `|` from a string literal
     *
     *  @param {string} content - the string to process
     */
    stripMargin(content) {
        return content.replace(/^[ ]*\|/gm, '');
    }

    /**
     * Utility function to copy and process templates.
     *
     * @param {string} source - source
     * @param {string} destination - destination
     * @param {*} generator - reference to the generator
     * @param {*} options - options object
     * @param {*} context - context
     */
    template(source, destination, generator, options = {}, context) {
        const _this = generator || this;
        const _context = context || _this;
        const customDestination = _this.destinationPath(destination);
        if (!customDestination) {
            this.debug(`File ${destination} ignored`);
            return;
        }
        jhipsterUtils.renderContent(source, _this, _context, options, res => {
            _this.fs.write(customDestination, res);
        });
    }

    /**
     * Utility function to render a template into a string
     *
     * @param {string} source - source
     * @param {function} callback - callback to take the rendered template as a string
     * @param {*} generator - reference to the generator
     * @param {*} options - options object
     * @param {*} context - context
     */
    render(source, callback, generator, options = {}, context) {
        const _this = generator || this;
        const _context = context || _this;
        jhipsterUtils.renderContent(source, _this, _context, options, res => {
            callback(res);
        });
    }

    /**
     * Utility function to copy files.
     *
     * @param {string} source - Original file.
     * @param {string} destination - The resulting file.
     */
    copy(source, destination) {
        const customDestination = this.destinationPath(destination);
        if (!customDestination) {
            this.debug(`File ${destination} ignored`);
            return;
        }
        this.fs.copy(this.templatePath(source), customDestination);
    }

    /**
     * Print a debug message.
     *
     * @param {string} msg - message to print
     * @param {string[]} args - arguments to print
     */
    debug(msg, ...args) {
        const formattedMsg = `${chalk.yellow.bold('DEBUG!')} ${msg}`;
        if ((this.configOptions && this.configOptions.isDebugEnabled) || (this.options && this.options.debug)) {
            this.log(formattedMsg);
            args.forEach(arg => this.log(arg));
        }
        if (this._debug && this._debug.enabled) {
            this._debug(formattedMsg);
            args.forEach(arg => this._debug(arg));
        }
    }

    /**
     * Check if Java is installed
     */
    checkJava() {
        if (this.skipChecks || this.skipServer) return;
        const done = this.async();
        exec('java -version', (err, stdout, stderr) => {
            if (err) {
                this.warning('Java is not found on your computer.');
            } else {
                const javaVersion = stderr.match(/(?:java|openjdk) version "(.*)"/)[1];
                if (
                    !javaVersion.match(new RegExp('12'.replace('.', '\\.'))) &&
                    !javaVersion.match(new RegExp('11'.replace('.', '\\.'))) &&
                    !javaVersion.match(new RegExp(constants.JAVA_VERSION.replace('.', '\\.')))
                ) {
                    this.warning(`Java 8, 11, or 12 are not found on your computer. Your Java version is: ${chalk.yellow(javaVersion)}`);
                }
            }
            done();
        });
    }

    /**
     * Check if Node is installed
     */
    checkNode() {
        if (this.skipChecks) return;
        const nodeFromPackageJson = packagejs.engines.node;
        if (!semver.satisfies(process.version, nodeFromPackageJson)) {
            this.warning(
                `Your NodeJS version is too old (${process.version}). You should use at least NodeJS ${chalk.bold(nodeFromPackageJson)}`
            );
        }
        if (!(process.release || {}).lts) {
            this.warning(
                'Your Node version is not LTS (Long Term Support), use it at your own risk! JHipster does not support non-LTS releases, so if you encounter a bug, please use a LTS version first.'
            );
        }
    }

    /**
     * Check if Git is installed
     */
    checkGit() {
        if (this.skipChecks || this.skipClient) return;
        this.gitInstalled = this.isGitInstalled();
    }

    /**
     * Generate Entity Queries
     *
     * @param {Array|Object} relationships - array of relationships
     * @param {string} entityInstance - entity instance
     * @param {string} dto - dto
     * @returns {{queries: Array, variables: Array, rxjsMapIsUsed: boolean, selectableEntities: Array, selectableManyToManyEntities: Array}}
     */
    generateEntityQueries(relationships, entityInstance, dto) {
        const queries = [];
        const variables = [];
        const selectableEntities = [];
        const selectableManyToManyEntities = [];
        let rxjsMapIsUsed = false;
        relationships.forEach(relationship => {
            const relationshipType = relationship.relationshipType;
            const ownerSide = relationship.ownerSide;
            const otherEntityName = relationship.otherEntityName;
            const selectableEntityType = `I${relationship.otherEntityAngularName}`;
            let query;
            let variableName;
            let filter;
            if (relationshipType === 'many-to-many' && ownerSide === true && !selectableManyToManyEntities.includes(selectableEntityType)) {
                selectableManyToManyEntities.push(selectableEntityType);
            }
            if (
                relationshipType === 'many-to-one' ||
                (relationshipType === 'one-to-one' && ownerSide === true) ||
                (relationshipType === 'many-to-many' && ownerSide === true)
            ) {
                if (!selectableEntities.includes(selectableEntityType)) {
                    selectableEntities.push(selectableEntityType);
                }
                if (relationshipType === 'one-to-one' && ownerSide === true && otherEntityName !== 'user') {
                    rxjsMapIsUsed = true;
                    variableName = relationship.relationshipFieldNamePlural.toLowerCase();
                    if (variableName === entityInstance) {
                        variableName += 'Collection';
                    }
                    const relationshipFieldName = `${relationship.relationshipFieldName}`;
                    const relationshipFieldNameIdCheck = `!${entityInstance}.${relationshipFieldName} || !${entityInstance}.${relationshipFieldName}.id`;

                    filter = `filter: '${relationship.otherEntityRelationshipName.toLowerCase()}-is-null'`;
                    if (relationship.jpaMetamodelFiltering) {
                        filter = `'${relationship.otherEntityRelationshipName}Id.specified': 'false'`;
                    }

                    query = `
                        this.${relationship.otherEntityName}Service
                            .query({${filter}})
                            .pipe(map((res: HttpResponse<I${relationship.otherEntityAngularName}[]>) => res.body ?? []))
                            .subscribe((resBody: I${relationship.otherEntityAngularName}[]) => {
                                if (${relationshipFieldNameIdCheck}) {
                                    this.${variableName} = resBody;
                                } else {
                                    this.${relationship.otherEntityName}Service
                                        .find(${entityInstance}.${relationshipFieldName}.id)
                                        .pipe(map((subRes: HttpResponse<I${relationship.otherEntityAngularName}>) => subRes.body ? [subRes.body].concat(resBody) : resBody))
                                        .subscribe((concatRes: I${relationship.otherEntityAngularName}[]) => this.${variableName} = concatRes);
                                }
                            });`;
                } else {
                    variableName = relationship.otherEntityNameCapitalizedPlural.toLowerCase();
                    if (variableName === entityInstance) {
                        variableName += 'Collection';
                    }
                    query = `
                        this.${relationship.otherEntityName}Service.query()
                            .subscribe((res: HttpResponse<I${relationship.otherEntityAngularName}[]>) => this.${variableName} = res.body ?? []);`;
                }
            }
            if (variableName && !queries.includes(query)) {
                queries.push(query);
                variables.push(`${variableName}: I${relationship.otherEntityAngularName}[] = [];`);
            }
        });
        return {
            queries,
            variables,
            rxjsMapIsUsed,
            selectableEntities,
            selectableManyToManyEntities,
        };
    }

    /**
     * Generate Entity Client Field Default Values
     *
     * @param {Array|Object} fields - array of fields
     * @returns {Array} defaultVariablesValues
     */
    generateEntityClientFieldDefaultValues(fields, clientFramework = ANGULAR) {
        const defaultVariablesValues = {};
        fields.forEach(field => {
            const fieldType = field.fieldType;
            const fieldName = field.fieldName;
            if (fieldType === 'Boolean') {
                if (clientFramework === REACT) {
                    defaultVariablesValues[fieldName] = `${fieldName}: false,`;
                } else {
                    defaultVariablesValues[fieldName] = `this.${fieldName} = this.${fieldName} ?? false;`;
                }
            }
        });
        return defaultVariablesValues;
    }

    /**
     * Find key type for Typescript
     *
     * @param {string} primaryKey - primary key definition
     * @returns {string} primary key type in Typescript
     */
    getTypescriptKeyType(primaryKey) {
        if (typeof primaryKey === 'object') {
            primaryKey = primaryKey.type;
        }
        if (primaryKey === 'String' || primaryKey === 'UUID') {
            return 'string';
        }
        return 'number';
    }

    /**
     * Generate Entity Client Field Declarations
     *
     * @param {string} primaryKey - primary key definition
     * @param {Array|Object} fields - array of fields
     * @param {Array|Object} relationships - array of relationships
     * @param {string} dto - dto
     * @param {boolean} embedded - either the actual entity is embedded or not
     * @returns variablesWithTypes: Array
     */
    generateEntityClientFields(primaryKey, fields, relationships, dto, customDateType = 'dayjs.Dayjs', embedded = false) {
        const variablesWithTypes = [];
        if (!embedded && primaryKey) {
            const tsKeyType = this.getTypescriptKeyType(primaryKey);
            if (this.jhipsterConfig.clientFramework !== ANGULAR) {
                variablesWithTypes.push(`id?: ${tsKeyType}`);
            }
        }
        fields.forEach(field => {
            const fieldType = field.fieldType;
            const fieldName = field.fieldName;
            const nullable = !field.id && field.nullable;
            let tsType = 'any';
            if (field.fieldIsEnum) {
                tsType = fieldType;
            } else if (fieldType === 'Boolean') {
                tsType = 'boolean';
            } else if (['Integer', 'Long', 'Float', 'Double', 'BigDecimal'].includes(fieldType)) {
                tsType = 'number';
            } else if (['String', 'UUID', 'Duration', 'byte[]', 'ByteBuffer'].includes(fieldType)) {
                tsType = 'string';
                if (['byte[]', 'ByteBuffer'].includes(fieldType) && field.fieldTypeBlobContent !== 'text') {
                    variablesWithTypes.push(`${fieldName}ContentType?: ${nullable ? 'string | null' : 'string'}`);
                }
            } else if (['LocalDate', 'Instant', 'ZonedDateTime'].includes(fieldType)) {
                tsType = customDateType;
            }
            if (nullable) {
                tsType += ' | null';
            }
            variablesWithTypes.push(`${fieldName}?: ${tsType}`);
        });

        relationships.forEach(relationship => {
            let fieldType;
            let fieldName;
            const nullable = !relationship.relationshipValidateRules || !relationship.relationshipValidateRules.includes('required');
            const relationshipType = relationship.relationshipType;
            if (relationshipType === 'one-to-many' || relationshipType === 'many-to-many') {
                fieldType = `I${relationship.otherEntityAngularName}[]`;
                fieldName = relationship.relationshipFieldNamePlural;
            } else {
                fieldType = `I${relationship.otherEntityAngularName}`;
                fieldName = relationship.relationshipFieldName;
            }
            if (nullable) {
                fieldType += ' | null';
            }
            variablesWithTypes.push(`${fieldName}?: ${fieldType}`);
        });
        return variablesWithTypes;
    }

    /**
     * Generate Entity Client Imports
     *
     * @param {Array|Object} relationships - array of relationships
     * @param {string} dto - dto
     * @param {string} clientFramework the client framework, 'angularX' or 'react'.
     * @returns typeImports: Map
     */
    generateEntityClientImports(relationships, dto, clientFramework = this.clientFramework) {
        const typeImports = new Map();
        relationships.forEach(relationship => {
            const otherEntityAngularName = relationship.otherEntityAngularName;
            const importType = `I${otherEntityAngularName}`;
            let importPath;
            if (this.isBuiltInUser(otherEntityAngularName)) {
                importPath = clientFramework === ANGULAR ? 'app/entities/user/user.model' : 'app/shared/model/user.model';
            } else {
                importPath =
                    clientFramework === ANGULAR
                        ? `app/entities/${relationship.otherEntityClientRootFolder}${relationship.otherEntityFolderName}/${relationship.otherEntityFileName}.model`
                        : `app/shared/model/${relationship.otherEntityClientRootFolder}${relationship.otherEntityFileName}.model`;
            }
            typeImports.set(importType, importPath);
        });
        return typeImports;
    }

    /**
     * Generate Entity Client Enum Imports
     *
     * @param {Array|Object} fields - array of the entity fields
     * @param {string} clientFramework the client framework, 'angularX' or 'react'.
     * @returns typeImports: Map
     */
    generateEntityClientEnumImports(fields, clientFramework = this.clientFramework) {
        const typeImports = new Map();
        const uniqueEnums = {};
        fields.forEach(field => {
            const fileName = _.kebabCase(field.fieldType);
            if (field.fieldIsEnum && (!uniqueEnums[field.fieldType] || (uniqueEnums[field.fieldType] && field.fieldValues.length !== 0))) {
                const importType = `${field.fieldType}`;
                const modelPath = clientFramework === ANGULAR ? 'entities' : 'shared/model';
                const importPath = `app/${modelPath}/enumerations/${fileName}.model`;
                uniqueEnums[field.fieldType] = field.fieldType;
                typeImports.set(importType, importPath);
            }
        });
        return typeImports;
    }

    /**
     * Get DB type from DB value
     * @param {string} db - db
     */
    getDBTypeFromDBValue(db) {
        return jhipsterUtils.getDBTypeFromDBValue(db);
    }

    /**
     * Get build directory used by buildTool
     * @param {string} buildTool - buildTool
     */
    getBuildDirectoryForBuildTool(buildTool) {
        return buildTool === 'maven' ? 'target/' : 'build/';
    }

    /**
     * Get resource build directory used by buildTool
     * @param {string} buildTool - buildTool
     */
    getResourceBuildDirectoryForBuildTool(buildTool) {
        return buildTool === 'maven' ? 'target/classes/' : 'build/resources/main/';
    }

    /**
     * @returns generated JDL from entities
     */
    generateJDLFromEntities() {
        let jdlObject;
        const entities = new Map();
        try {
            this.getExistingEntities().forEach(entity => {
                entities.set(entity.name, entity.definition);
            });
            jdlObject = JSONToJDLEntityConverter.convertEntitiesToJDL({ entities });
            JSONToJDLOptionConverter.convertServerOptionsToJDL({ 'generator-jhipster': this.config.getAll() }, jdlObject);
        } catch (error) {
            this.log(error.message || error);
            this.error('\nError while parsing entities to JDL\n');
        }
        return jdlObject;
    }

    /**
     * Generate language objects in array of "'en': { name: 'English' }" format
     * @param {string[]} languages
     * @returns generated language options
     */
    generateLanguageOptions(languages, clientFramework) {
        const selectedLangs = this.getAllSupportedLanguageOptions().filter(lang => languages.includes(lang.value));
        if (clientFramework === REACT) {
            return selectedLangs.map(lang => `'${lang.value}': { name: '${lang.dispName}'${lang.rtl ? ', rtl: true' : ''} }`);
        }

        return selectedLangs.map(lang => `'${lang.value}': { name: '${lang.dispName}'${lang.rtl ? ', rtl: true' : ''} }`);
    }

    /**
     * Check if language should be skipped for locale setting
     * @param {string} language
     */
    skipLanguageForLocale(language) {
        const out = this.getAllSupportedLanguageOptions().filter(lang => language === lang.value);
        return out && out[0] && !!out[0].skipForLocale;
    }

    /**
     * Get UAA app name from path provided.
     * @param {string} input - path
     */
    getUaaAppName(input) {
        if (!input) return false;

        input = input.trim();
        let fromPath = '';
        if (path.isAbsolute(input)) {
            fromPath = `${input}/.yo-rc.json`;
        } else {
            fromPath = this.destinationPath(`${input}/.yo-rc.json`);
        }

        if (shelljs.test('-f', fromPath)) {
            const fileData = this.fs.readJSON(fromPath);
            if (fileData && fileData['generator-jhipster']) {
                return fileData['generator-jhipster'];
            }
            return false;
        }
        return false;
    }

    /**
     * Return the method name which converts the filter to specification
     * @param {string} fieldType
     */
    getSpecificationBuilder(fieldType) {
        if (['Integer', 'Long', 'Float', 'Double', 'BigDecimal', 'LocalDate', 'ZonedDateTime', 'Instant', 'Duration'].includes(fieldType)) {
            return 'buildRangeSpecification';
        }
        if (fieldType === 'String') {
            return 'buildStringSpecification';
        }
        return 'buildSpecification';
    }

    /**
     * @param {string} fieldType
     * @returns {boolean} true if type is filterable; false otherwise.
     */
    isFilterableType(fieldType) {
        return !['byte[]', 'ByteBuffer'].includes(fieldType);
    }

    /**
     * Rebuild client for Angular
     */
    rebuildClient() {
        const done = this.async();
        this.log(`\n${chalk.bold.green('Running `webpack:build` to update client app\n')}`);
        this.spawnCommand(this.clientPackageManager, ['run', 'webpack:build']).on('close', () => {
            done();
        });
    }

    /**
     * Generate a primary key, according to the type
     *
     * @param {any} primaryKey - primary key definition
     * @param {number} index - the index of the primary key, currently it's possible to generate 2 values, index = 0 - first key (default), otherwise second key
     */
    generateTestEntityId(primaryKey, index = 0) {
        if (typeof primaryKey === 'object') {
            primaryKey = primaryKey.type;
        }
        if (primaryKey === 'String') {
            return index === 0 ? "'123'" : "'456'";
        }
        if (primaryKey === 'UUID') {
            return index === 0 ? "'9fec3727-3421-4967-b213-ba36557ca194'" : "'1361f429-3817-4123-8ee3-fdf8943310b2'";
        }
        return index === 0 ? 123 : 456;
    }

    /**
     * Return the primary key data type based on DB
     *
     * @param {any} databaseType - the database type
     */
    getPkType(databaseType) {
        if (this.jhipsterConfig.pkType) {
            return this.jhipsterConfig.pkType;
        }
        if (['mongodb', 'neo4j', 'couchbase'].includes(databaseType)) {
            return 'String';
        }
        if (databaseType === 'cassandra') {
            return 'UUID';
        }
        return 'Long';
    }

    /**
     * Returns the URL for a particular databaseType and protocol
     *
     * @param {string} databaseType
     * @param {string} protocol
     * @param {*} options
     */
    getDBCUrl(databaseType, protocol, options = {}) {
        if (!protocol) {
            throw new Error('protocol is required');
        }
        if (!options.databaseName) {
            throw new Error("option 'databaseName' is required");
        }
        if (['mysql', 'mariadb', 'postgresql', 'oracle', 'mssql'].includes(databaseType) && !options.hostname) {
            throw new Error(`option 'hostname' is required for ${databaseType} databaseType`);
        }
        let dbcUrl;
        let extraOptions;
        if (databaseType === 'mysql') {
            dbcUrl = `${protocol}:mysql://${options.hostname}:3306/${options.databaseName}`;
            extraOptions =
                '?useUnicode=true&characterEncoding=utf8&useSSL=false&useLegacyDatetimeCode=false&serverTimezone=UTC&createDatabaseIfNotExist=true';
        } else if (databaseType === 'mariadb') {
            dbcUrl = `${protocol}:mariadb://${options.hostname}:3306/${options.databaseName}`;
            extraOptions = '?useLegacyDatetimeCode=false&serverTimezone=UTC';
        } else if (databaseType === 'postgresql') {
            dbcUrl = `${protocol}:postgresql://${options.hostname}:5432/${options.databaseName}`;
        } else if (databaseType === 'oracle') {
            dbcUrl = `${protocol}:oracle:thin:@${options.hostname}:1521:${options.databaseName}`;
        } else if (databaseType === 'mssql') {
            dbcUrl = `${protocol}:sqlserver://${options.hostname}:1433;database=${options.databaseName}`;
        } else if (databaseType === 'h2Disk') {
            if (!options.localDirectory) {
                throw new Error(`'localDirectory' option should be provided for ${databaseType} databaseType`);
            }
            if (protocol === 'r2dbc') {
                dbcUrl = `${protocol}:h2:file://${options.localDirectory}/${options.databaseName}`;
            } else {
                dbcUrl = `${protocol}:h2:file:${options.localDirectory}/${options.databaseName}`;
            }
            extraOptions = ';DB_CLOSE_DELAY=-1';
        } else if (databaseType === 'h2Memory') {
            if (protocol === 'r2dbc') {
                dbcUrl = `${protocol}:h2:mem:///${options.databaseName}`;
            } else {
                dbcUrl = `${protocol}:h2:mem:${options.databaseName}`;
            }
            extraOptions = ';DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE';
        } else {
            throw new Error(`${databaseType} databaseType is not supported`);
        }

        if (!options.skipExtraOptions && extraOptions) {
            dbcUrl += extraOptions;
        }
        return dbcUrl;
    }

    /**
     * Returns the primary key value based on the primary key type, DB and default value
     *
     * @param {string} primaryKeyType - the primary key type
     * @param {string} databaseType - the database type
     * @param {string} defaultValue - default value
     * @returns {string} java primary key value
     */
    getPrimaryKeyValue(primaryKeyType, databaseType = this.jhipsterConfig.databasetype, defaultValue = 1) {
        let value;
        switch (primaryKeyType) {
            case 'String':
                value = `"id${defaultValue}"`;
                // Special case with a OneToOne relationship with User and @MapsId when using OAuth
                if (databaseType === 'sql') {
                    value = 'UUID.randomUUID().toString()';
                }
                break;
            case 'UUID':
                value = 'UUID.randomUUID()';
                break;
            default:
                value = `${defaultValue}L`;
        }
        return value;
    }

    /**
     * Get a root folder name for entity
     * @param {string} clientRootFolder
     * @param {string} entityFileName
     */
    getEntityFolderName(clientRootFolder, entityFileName) {
        if (clientRootFolder) {
            return `${clientRootFolder}/${entityFileName}`;
        }
        return entityFileName;
    }

    /**
     * Get a parent folder path addition for entity
     * @param {string} clientRootFolder
     */
    getEntityParentPathAddition(clientRootFolder) {
        if (!clientRootFolder) {
            return '';
        }
        const relative = path.relative(`/app/entities/${clientRootFolder}/`, '/app/entities/');
        if (relative.includes('app')) {
            // Relative path outside angular base dir.
            const message = `
                "clientRootFolder outside app base dir '${clientRootFolder}'"
            `;
            // Test case doesn't have a environment instance so return 'error'
            if (this.env === undefined) {
                throw new Error(message);
            }
            this.error(message);
        }
        const entityFolderPathAddition = relative.replace(/[/|\\]?..[/|\\]entities/, '').replace('entities', '..');
        if (!entityFolderPathAddition) {
            return '';
        }
        return `${entityFolderPathAddition}/`;
    }

    /**
     * Some files are required to be written to disk before everything else.
     * Example '.prettierc' and '.prettierignore' are used by prettier transform.
     * @param {any} generator
     */
    registerCommitPriorityFilesTask(generator = this) {
        this.queueTask({
            method: () => {
                if (this.env.rootGenerator() !== this) return;
                const stream = this.env.sharedFs
                    .stream()
                    .pipe(filter(['.prettierrc', '.prettierignore']))
                    .pipe(generator.createConflicterAttributesTransform())
                    .pipe(
                        through.obj(function (file, enc, cb) {
                            const stream = this;

                            // If the file has no state requiring action, move on
                            if (file.state === null) {
                                cb();
                                return;
                            }

                            generator.conflicter.checkForCollision(file, (err, status) => {
                                if (err) {
                                    cb(err);
                                    return;
                                }

                                if (status === 'skip') {
                                    delete file.state;
                                } else {
                                    stream.push(file);
                                }

                                cb();
                            });
                            generator.conflicter.resolve();
                        })
                    );
                const done = generator.async();
                generator.fs.commit([], stream, () => {
                    done();
                });
            },
            taskName: 'priorityFiles',
            queueName: 'jhipster:preConflicts',
        });
    }

    /**
     * Register prettier as transform stream for prettifying files during generation
     * @param {any} generator
     */
    registerPrettierTransform(generator = this) {
        if (this.options.help) {
            return;
        }

        this.queueTask({
            method: () => {
                if (this.env.rootGenerator() && this.env.rootGenerator() !== this) {
                    return;
                }

                const prettierOptions = { plugins: [prettierPluginPackagejson] };
                if (!this.skipServer && !this.jhipsterConfig.skipServer) {
                    prettierOptions.plugins.push(prettierPluginJava);
                }
                // Prettier is clever, it uses correct rules and correct parser according to file extension.
                const filterPatternForPrettier = `{,.,**/,.jhipster/**/}*.{${this.getPrettierExtensions()}}`;
                const prettierFilter = filter(['.yo-rc.json', filterPatternForPrettier], { restore: true });
                // this pipe will pass through (restore) anything that doesn't match typescriptFilter
                generator.registerTransformStream([
                    prettierFilter,
                    prettierTransform(prettierOptions, this, this.options.ignoreErrors),
                    prettierFilter.restore,
                ]);
            },
            taskName: 'queuePrettierTransform',
            queueName: 'jhipster:preConflicts',
        });
    }

    registerGeneratedAnnotationTransform() {
        this.registerTransformStream(generatedAnnotationTransform(this));
    }

    registerForceEntitiesTransform() {
        this.registerTransformStream(
            through.obj(function (file, enc, cb) {
                if (path.extname(file.path) === '.json' && path.basename(path.dirname(file.path)) === '.jhipster') {
                    file.conflicter = 'force';
                }
                this.push(file);
                cb();
            })
        );
    }

    parseYoAttributesFile(yoAttributeFileName) {
        let overridesContent;
        try {
            overridesContent = fs.readFileSync(yoAttributeFileName, 'utf-8');
        } catch (error) {
            this.warning(`Error loading yo attributes file ${yoAttributeFileName}, ${error}`);
            return null;
        }
        const absoluteDir = path.dirname(yoAttributeFileName);

        return Object.fromEntries(
            overridesContent
                .split(/\r?\n/)
                .map(override => override.trim())
                .map(override => override.split('#')[0].trim())
                .filter(override => override)
                .map(override => override.split(/\s+/))
                .map(([pattern, status = 'skip']) => [path.join(absoluteDir, pattern), status])
        );
    }

    getConflicterStatusForFile(filePath, yoAttributeFileName) {
        const fileDir = path.dirname(filePath);
        this.yoResolveByFile = this.yoResolveByFile || {};
        const yoResolveFiles = [];
        let foundYoAttributesFile = findUp.sync([yoAttributeFileName], { cwd: fileDir });
        while (foundYoAttributesFile) {
            yoResolveFiles.push(foundYoAttributesFile);
            foundYoAttributesFile = findUp.sync([yoAttributeFileName], { cwd: path.join(path.dirname(foundYoAttributesFile), '..') });
        }

        let fileStatus;
        if (yoResolveFiles) {
            yoResolveFiles.forEach(yoResolveFile => {
                if (this.yoResolveByFile[yoResolveFile] === undefined) {
                    this.yoResolveByFile[yoResolveFile] = this.parseYoAttributesFile(yoResolveFile);
                }
            });
            yoResolveFiles
                .map(yoResolveFile => this.yoResolveByFile[yoResolveFile])
                .map(attributes => attributes)
                .find(yoResolve => {
                    return Object.entries(yoResolve).some(([pattern, status]) => {
                        if (minimatch(filePath, pattern)) {
                            fileStatus = status;
                            return true;
                        }
                        return false;
                    });
                });
        }
        return fileStatus;
    }

    createConflicterAttributesTransform(yoAttributeFileName = '.yo-resolve') {
        const generator = this;
        return through.obj(function (file, enc, cb) {
            const status = generator.getConflicterStatusForFile(file.path, yoAttributeFileName);
            if (status) {
                file.conflicter = status;
            }
            this.push(file);
            cb();
        });
    }

    registerConflicterAttributesTransform(yoAttributeFileName) {
        this.registerTransformStream(this.createConflicterAttributesTransform(yoAttributeFileName));
    }

    /**
     * Check if the subgenerator has been invoked from JHipster CLI or from Yeoman (yo jhipster:subgenerator)
     */
    checkInvocationFromCLI() {
        if (!this.options.fromCli) {
            this.warning(
                `Deprecated: JHipster seems to be invoked using Yeoman command. Please use the JHipster CLI. Run ${chalk.red(
                    'jhipster <command>'
                )} instead of ${chalk.red('yo jhipster:<command>')}`
            );
        }
    }

    vueUpdateLanguagesInTranslationStore(languages) {
        const fullPath = `${this.CLIENT_MAIN_SRC_DIR}app/shared/config/store/translation-store.ts`;
        try {
            let content = 'languages: {\n';
            if (this.enableTranslation) {
                this.generateLanguageOptions(languages, this.clientFramework).forEach((ln, i) => {
                    content += `      ${ln}${i !== languages.length - 1 ? ',' : ''}\n`;
                });
            }
            content += '      // jhipster-needle-i18n-language-key-pipe - JHipster will add/remove languages in this object\n    }';
            jhipsterUtils.replaceContent(
                {
                    file: fullPath,
                    pattern: /languages:.*\{([^\]]*jhipster-needle-i18n-language-key-pipe[^}]*)}/g,
                    content,
                },
                this
            );
        } catch (e) {
            this.log(
                chalk.yellow('\nUnable to find ') +
                    fullPath +
                    chalk.yellow(' or missing required jhipster-needle. Language pipe not updated with languages: ') +
                    languages +
                    chalk.yellow(' since block was not found. Check if you have enabled translation support.\n')
            );
            this.debug('Error:', e);
        }
    }

    vueUpdateI18nConfig(languages) {
        const fullPath = `${this.CLIENT_MAIN_SRC_DIR}app/shared/config/config.ts`;

        try {
            // Add i18n config snippets for all languages
            let i18nConfig = 'const dateTimeFormats = {\n';
            if (this.enableTranslation) {
                languages.forEach((ln, i) => {
                    i18nConfig += this.generateDateTimeFormat(ln, i, languages.length);
                });
            }
            i18nConfig += '  // jhipster-needle-i18n-language-date-time-format - JHipster will add/remove format options in this object\n';
            i18nConfig += '}';

            jhipsterUtils.replaceContent(
                {
                    file: fullPath,
                    pattern: /const dateTimeFormats.*\{([^\]]*jhipster-needle-i18n-language-date-time-format[^}]*)}/g,
                    content: i18nConfig,
                },
                this
            );
        } catch (e) {
            this.log(
                chalk.yellow('\nUnable to find ') +
                    fullPath +
                    chalk.yellow(' or missing required jhipster-needle. Language pipe not updated with languages: ') +
                    languages +
                    chalk.yellow(' since block was not found. Check if you have enabled translation support.\n')
            );
            this.debug('Error:', e);
        }
    }

    vueUpdateLanguagesInWebpack(languages) {
        const fullPath = 'webpack/webpack.common.js';
        try {
            let content = 'groupBy: [\n';
            // prettier-ignore
            languages.forEach((language, i) => {
                content += `          { pattern: './${this.CLIENT_MAIN_SRC_DIR}i18n/${language}/*.json', fileName: './i18n/${language}.json' }${
                    i !== languages.length - 1 ? ',' : ''
                }\n`;
            });
            content += '          // jhipster-needle-i18n-language-webpack - JHipster will add/remove languages in this array\n        ]';

            jhipsterUtils.replaceContent(
                {
                    file: fullPath,
                    pattern: /groupBy:.*\[([^\]]*jhipster-needle-i18n-language-webpack[^\]]*)\]/g,
                    content,
                },
                this
            );
        } catch (e) {
            this.log(
                chalk.yellow('\nUnable to find ') +
                    fullPath +
                    chalk.yellow(' or missing required jhipster-needle. Webpack language task not updated with languages: ') +
                    languages +
                    chalk.yellow(' since block was not found. Check if you have enabled translation support.\n')
            );
            this.debug('Error:', e);
        }
    }

    generateDateTimeFormat(language, index, length) {
        let config = `  '${language}': {\n`;

        config += '    short: {\n';
        config += "      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric'\n";
        config += '    },\n';
        config += '    medium: {\n';
        config += "      year: 'numeric', month: 'short', day: 'numeric',\n";
        config += "      weekday: 'short', hour: 'numeric', minute: 'numeric'\n";
        config += '    },\n';
        config += '    long: {\n';
        config += "      year: 'numeric', month: 'long', day: 'numeric',\n";
        config += "      weekday: 'long', hour: 'numeric', minute: 'numeric'\n";
        config += '    }\n';
        config += '  }';
        if (index !== length - 1) {
            config += ',';
        }
        config += '\n';
        return config;
    }

    createUserManagementEntities() {
        this.configOptions.sharedEntities = this.configOptions.sharedEntities || {};
        this.configOptions.sharedLiquibaseFakeData = this.configOptions.sharedLiquibaseFakeData || {};

        if (
            this.configOptions.sharedEntities.User ||
            (this.jhipsterConfig.skipUserManagement && this.jhipsterConfig.authenticationType !== 'oauth2')
        ) {
            return;
        }

        const changelogDateDate = this.jhipsterConfig.creationTimestamp ? new Date(this.jhipsterConfig.creationTimestamp) : new Date();
        const changelogDate = formatDateForChangelog(changelogDateDate);
        // Create entity definition for built-in entity to make easier to deal with relationships.
        const user = {
            name: 'User',
            builtIn: true,
            entityTableName: `${this.getTableName(this.jhipsterConfig.jhiPrefix)}_user`,
            relationships: [],
            changelogDate,
        };

        loadRequiredConfigIntoEntity(user, this.jhipsterConfig);
        // Fallback to defaults for test cases.
        loadRequiredConfigIntoEntity(user, defaultConfig);

        const oauth2 = user.authenticationType === 'oauth2';
        const userIdType = oauth2 || user.databaseType !== 'sql' ? 'String' : this.getPkType(user.databaseType);
        const fieldValidateRulesMaxlength = userIdType === 'String' ? 100 : undefined;

        user.fields = [
            {
                fieldName: 'id',
                fieldType: userIdType,
                fieldValidateRulesMaxlength,
                fieldTranslationKey: 'global.field.id',
                fieldNameHumanized: 'ID',
                id: true,
            },
            {
                fieldName: 'login',
                fieldType: 'String',
            },
        ];

        prepareEntityForTemplates(user, this);
        user.fields.forEach(field => {
            prepareFieldForTemplates(user, field, this);
            prepareFieldForLiquibaseTemplates(user, field);
        });
        this.configOptions.sharedEntities.User = user;

        user.resetFakerSeed();
        const liquibaseFakeData = oauth2
            ? []
            : [
                  { id: userIdType === 'Long' ? 1 : user.primaryKey.fields[0].generateFakeData() },
                  { id: userIdType === 'Long' ? 2 : user.primaryKey.fields[0].generateFakeData() },
              ];
        user.liquibaseFakeData = liquibaseFakeData;
        this.configOptions.sharedLiquibaseFakeData.User = liquibaseFakeData;
    }

    /**
     * Convert to Java bean name case
     *
     * Handle the specific case when the second letter is capitalized
     * See http://stackoverflow.com/questions/2948083/naming-convention-for-getters-setters-in-java
     *
     * @param {string} beanName
     * @return {string}
     */
    javaBeanCase(beanName) {
        const secondLetter = beanName.charAt(1);
        if (secondLetter === secondLetter.toUpperCase()) {
            return beanName;
        }
        return _.upperFirst(beanName);
    }

    /**
     * Create a java getter of reference.
     *
     * @param {object} reference
     * @return {string}
     */
    buildJavaGet(reference) {
        return reference.path.map(partialPath => `get${this.javaBeanCase(partialPath)}()`).join('.');
    }

    /**
     * Create a dotted path of reference.
     *
     * @param {object} reference
     * @return {string}
     */
    buildReferencePath(reference) {
        return reference.path.join('.');
    }

    /**
     * Create a java getter method of reference.
     *
     * @param {object} reference
     * @param {string} type
     * @return {string}
     */
    buildJavaGetter(reference, type = reference.type) {
        return `${type} get${this.javaBeanCase(reference.name)}()`;
    }

    /**
     * Create a java getter method of reference.
     *
     * @param {object} reference
     * @param {string} valueDefinition
     * @return {string}
     */
    buildJavaSetter(reference, valueDefinition = `${reference.type} ${reference.name}`) {
        return `set${this.javaBeanCase(reference.name)}(${valueDefinition})`;
    }

    /**
     * Create a angular form path getter method of reference.
     *
     * @param {object} reference
     * @param {string[]} valueDefinition
     * @return {string}
     */
    buildAngularFormPath(reference, prefix = []) {
        const formPath = [...prefix, ...reference.path].join("', '");
        return `'${formPath}'`;
    }

    /**
     * @private
     *
     * Print entity json representation.
     *
     * @param {object} entity
     */
    debugEntity(entity) {
        this.log(stringify(entity));
    }
};
