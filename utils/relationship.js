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

const _ = require('lodash');
const pluralize = require('pluralize');
const { isReservedTableName } = require('../jdl/jhipster/reserved-keywords');
const { stringify } = require('.');

function prepareRelationshipForTemplates(entityWithConfig, relationship, generator, ignoreMissingRequiredRelationship) {
    const entityName = entityWithConfig.name;
    const otherEntityName = relationship.otherEntityName;
    const jhiTablePrefix = entityWithConfig.jhiTablePrefix || generator.getTableName(entityWithConfig.jhiPrefix);

    if (!relationship.otherEntity) {
        throw new Error(`Error at entity ${entityName}: could not find the entity of the relationship ${stringify(relationship)}`);
    }
    const otherEntityData = relationship.otherEntity;
    if (otherEntityData.primaryKey) {
        _.defaults(relationship, {
            // otherEntityField should be id if not specified
            otherEntityField: otherEntityData.primaryKey.name,
        });
        relationship.otherEntityPrimaryKeyType = otherEntityData.primaryKey.type;
        relationship.otherEntityField = relationship.otherEntityField || otherEntityData.primaryKey.name;
    }

    _.defaults(relationship, {
        // let ownerSide true when type is 'many-to-one' for convenience.
        // means that this side should control the reference.
        ownerSide:
            relationship.relationshipType !== 'one-to-many' && (relationship.ownerSide || relationship.relationshipType === 'many-to-one'),
    });

    relationship.otherSideReferenceExists = false;

    relationship.otherEntityIsEmbedded = otherEntityData.embedded;

    // Look for fields at the other other side of the relationship
    if (otherEntityData.relationships) {
        let otherRelationship;
        if (relationship.otherEntityRelationshipName) {
            otherRelationship = otherEntityData.relationships.find(otherSideRelationship => {
                if (_.upperFirst(otherSideRelationship.otherEntityName) !== _.upperFirst(entityName)) {
                    return false;
                }
                return otherSideRelationship.relationshipName === relationship.otherEntityRelationshipName;
            });
            if (
                otherRelationship &&
                otherRelationship.otherEntityRelationshipName &&
                otherRelationship.otherEntityRelationshipName !== relationship.relationshipName
            ) {
                throw new Error(
                    `Error at entity ${entityName}: relationship name is not synchronized ${stringify(relationship)} with ${stringify(
                        otherRelationship
                    )}`
                );
            }
        } else {
            otherRelationship = otherEntityData.relationships.find(otherSideRelationship => {
                if (_.upperFirst(otherSideRelationship.otherEntityName) !== _.upperFirst(entityName)) {
                    return false;
                }
                if (!otherSideRelationship.otherEntityRelationshipName) {
                    return false;
                }
                return otherSideRelationship.otherEntityRelationshipName === relationship.relationshipName;
            });
        }
        if (otherRelationship) {
            relationship.otherSideReferenceExists = true;
            if (
                !(relationship.relationshipType === 'one-to-one' && otherRelationship.relationshipType === 'one-to-one') &&
                !(relationship.relationshipType === 'many-to-one' && otherRelationship.relationshipType === 'one-to-many') &&
                !(relationship.relationshipType === 'one-to-many' && otherRelationship.relationshipType === 'many-to-one') &&
                !(relationship.relationshipType === 'many-to-many' && otherRelationship.relationshipType === 'many-to-many')
            ) {
                throw new Error(
                    `Error at entity ${entityName}: relationship type is not synchronized ${stringify(relationship)} with ${stringify(
                        otherRelationship
                    )}`
                );
            }
            _.defaults(relationship, {
                otherRelationship,
                otherEntityRelationshipName: otherRelationship.relationshipName,
                otherEntityRelationshipNamePlural: otherRelationship.relationshipNamePlural,
                otherEntityRelationshipNameCapitalized: otherRelationship.relationshipNameCapitalized,
                otherEntityRelationshipNameCapitalizedPlural: relationship.relationshipNameCapitalizedPlural,
            });
        } else if (
            !ignoreMissingRequiredRelationship &&
            generator.jhipsterConfig.databaseType !== 'neo4j' &&
            (relationship.relationshipType === 'one-to-many' || relationship.ownerSide === false)
        ) {
            throw new Error(`Error at entity ${entityName}: could not find the other side of the relationship ${stringify(relationship)}`);
        } else {
            generator.debug(`Entity ${entityName}: Could not find the other side of the relationship ${stringify(relationship)}`);
        }
        relationship.otherRelationship = otherRelationship;
    }

    relationship.relatedField = otherEntityData.fields.find(field => field.fieldName === relationship.otherEntityField);
    if (!relationship.relatedField && !relationship.otherEntity.embedded) {
        if (otherEntityData.primaryKey && otherEntityData.primaryKey.derived) {
            Object.defineProperty(relationship, 'relatedField', {
                get() {
                    const relatedField = otherEntityData.primaryKey.derivedFields.find(
                        field => field.fieldName === relationship.otherEntityField
                    );
                    return relatedField;
                },
            });
        } else if (!ignoreMissingRequiredRelationship) {
            throw new Error(`Error looking for field ${relationship.otherEntityField} at ${otherEntityData.name}`);
        }
    }
    if (relationship.relatedField) {
        relationship.otherEntityFieldCapitalized = relationship.relatedField.fieldNameCapitalized;
    } else {
        relationship.otherEntityFieldCapitalized = _.upperFirst(relationship.otherEntityField);
    }

    if (relationship.otherEntityRelationshipName !== undefined) {
        _.defaults(relationship, {
            otherEntityRelationshipNamePlural: pluralize(relationship.otherEntityRelationshipName),
            otherEntityRelationshipNameCapitalized: _.upperFirst(relationship.otherEntityRelationshipName),
        });
        _.defaults(relationship, {
            otherEntityRelationshipNameCapitalizedPlural: pluralize(relationship.otherEntityRelationshipNameCapitalized),
        });
    }

    const relationshipName = relationship.relationshipName;
    _.defaults(relationship, {
        relationshipNamePlural: pluralize(relationshipName),
        relationshipFieldName: _.lowerFirst(relationshipName),
        relationshipNameCapitalized: _.upperFirst(relationshipName),
        relationshipNameHumanized: _.startCase(relationshipName),
        columnName: generator.getColumnName(relationshipName),
        otherEntityNamePlural: pluralize(otherEntityName),
        otherEntityNameCapitalized: _.upperFirst(otherEntityName),
        otherEntityTableName:
            otherEntityData.entityTableName ||
            generator.getTableName(generator.isBuiltInUser(otherEntityName) ? `${jhiTablePrefix}_${otherEntityName}` : otherEntityName),
    });

    _.defaults(relationship, {
        relationshipFieldNamePlural: pluralize(relationship.relationshipFieldName),
        relationshipNameCapitalizedPlural:
            relationship.relationshipName.length > 1
                ? pluralize(relationship.relationshipNameCapitalized)
                : _.upperFirst(pluralize(relationship.relationshipName)),
        otherEntityNameCapitalizedPlural: pluralize(relationship.otherEntityNameCapitalized),
    });

    if (entityWithConfig.dto === 'mapstruct') {
        if (otherEntityData.dto !== 'mapstruct' && !generator.isBuiltInUser(otherEntityName)) {
            generator.warning(
                `Entity ${entityName}: this entity has the DTO option, and it has a relationship with entity "${otherEntityName}" that doesn't have the DTO option. This will result in an error.`
            );
        }
    }

    if (isReservedTableName(relationship.otherEntityTableName, entityWithConfig.prodDatabaseType) && jhiTablePrefix) {
        const otherEntityTableName = relationship.otherEntityTableName;
        relationship.otherEntityTableName = `${jhiTablePrefix}_${otherEntityTableName}`;
    }

    if (relationship.otherEntityAngularName === undefined) {
        if (generator.isBuiltInUser(otherEntityName)) {
            relationship.otherEntityAngularName = 'User';
        } else {
            const otherEntityAngularSuffix = otherEntityData ? otherEntityData.angularJSSuffix || '' : '';
            relationship.otherEntityAngularName =
                _.upperFirst(relationship.otherEntityName) + generator.upperFirstCamelCase(otherEntityAngularSuffix);
        }
    }

    _.defaults(relationship, {
        otherEntityStateName: _.kebabCase(relationship.otherEntityAngularName),
        jpaMetamodelFiltering: otherEntityData.jpaMetamodelFiltering && !entityWithConfig.reactive,
    });

    if (!generator.isBuiltInUser(otherEntityName)) {
        _.defaults(relationship, {
            otherEntityFileName: _.kebabCase(relationship.otherEntityAngularName),
            otherEntityFolderName: _.kebabCase(relationship.otherEntityAngularName),
        });

        const otherEntityClientRootFolder = otherEntityData.clientRootFolder || otherEntityData.microserviceName || '';
        if (entityWithConfig.skipUiGrouping || !otherEntityClientRootFolder) {
            relationship.otherEntityClientRootFolder = '';
        } else {
            relationship.otherEntityClientRootFolder = `${otherEntityClientRootFolder}/`;
        }
        if (otherEntityClientRootFolder) {
            if (entityWithConfig.clientRootFolder === otherEntityClientRootFolder) {
                relationship.otherEntityModulePath = relationship.otherEntityFolderName;
            } else {
                relationship.otherEntityModulePath = `${
                    entityWithConfig.entityParentPathAddition ? `${entityWithConfig.entityParentPathAddition}/` : ''
                }${otherEntityClientRootFolder}/${relationship.otherEntityFolderName}`;
            }
            relationship.otherEntityModelName = `${otherEntityClientRootFolder}/${relationship.otherEntityFileName}`;
            relationship.otherEntityPath = `${otherEntityClientRootFolder}/${relationship.otherEntityFolderName}`;
        } else {
            relationship.otherEntityModulePath = `${
                entityWithConfig.entityParentPathAddition ? `${entityWithConfig.entityParentPathAddition}/` : ''
            }${relationship.otherEntityFolderName}`;
            relationship.otherEntityModelName = relationship.otherEntityFileName;
            relationship.otherEntityPath = relationship.otherEntityFolderName;
        }
    }

    // Load in-memory data for root
    if (relationship.relationshipType === 'many-to-many' && relationship.ownerSide) {
        entityWithConfig.fieldsContainOwnerManyToMany = true;
    } else if (relationship.relationshipType === 'one-to-one' && !relationship.ownerSide) {
        entityWithConfig.fieldsContainNoOwnerOneToOne = true;
    } else if (relationship.relationshipType === 'one-to-one' && relationship.ownerSide) {
        entityWithConfig.fieldsContainOwnerOneToOne = true;
    } else if (relationship.relationshipType === 'one-to-many') {
        entityWithConfig.fieldsContainOneToMany = true;
    } else if (relationship.relationshipType === 'many-to-one') {
        entityWithConfig.fieldsContainManyToOne = true;
    }
    if (relationship.otherEntityIsEmbedded) {
        entityWithConfig.fieldsContainEmbedded = true;
    }

    if (relationship.relationshipValidateRules && relationship.relationshipValidateRules.includes('required')) {
        if (entityName.toLowerCase() === relationship.otherEntityName.toLowerCase()) {
            generator.warning(`Error at entity ${entityName}: required relationships to the same entity are not supported.`);
        } else {
            relationship.relationshipValidate = relationship.relationshipRequired = entityWithConfig.validation = true;
        }
    }
    relationship.nullable = !(relationship.relationshipValidate === true && relationship.relationshipRequired);

    relationship.shouldWriteJoinTable = relationship.relationshipType === 'many-to-many' && relationship.ownerSide;
    if (relationship.shouldWriteJoinTable) {
        relationship.joinTable = {
            name: generator.getJoinTableName(
                entityWithConfig.entityTableName,
                relationship.relationshipName,
                entityWithConfig.prodDatabaseType
            ),
        };
    }

    const entityType = relationship.otherEntityNameCapitalized;
    if (!entityWithConfig.differentTypes.includes(entityType)) {
        entityWithConfig.differentTypes.push(entityType);
    }
    if (!entityWithConfig.differentRelationships[entityType]) {
        entityWithConfig.differentRelationships[entityType] = [];
    }
    entityWithConfig.differentRelationships[entityType].push(relationship);
    relationship.reference = relationshipToReference(entityWithConfig, relationship);
    return relationship;
}

function relationshipToReference(entity, relationship, pathPrefix = []) {
    const collection = relationship.relationshipType === 'one-to-many' || relationship.relationshipType === 'many-to-many';
    const name = collection ? relationship.relationshipNamePlural : relationship.relationshipName;
    const reference = {
        id: relationship.id,
        entity,
        relationship,
        owned: relationship.ownerSide,
        collection,
        doc: relationship.javaDoc,
        name,
        nameCapitalized: collection ? relationship.relationshipNameCapitalizedPlural : relationship.relationshipNameCapitalized,
        get type() {
            return relationship.otherEntity.primaryKey ? relationship.otherEntity.primaryKey.type : undefined;
        },
        path: [...pathPrefix, name],
        idReferences: relationship.otherEntity.idFields ? relationship.otherEntity.idFields.map(field => field.reference) : [],
        valueReference: relationship.otherEntityField && relationship.otherEntityField.reference,
    };
    return reference;
}

module.exports = { prepareRelationshipForTemplates, relationshipToReference };
