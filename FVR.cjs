const fs = require('fs').promises;
const path = require('path');
const { log } = require('./logger.cjs'); // Importing IST-based logger
const desConfig = require('./dest.config.js')


// Function to check if a field exists within the schema (handles nested fields)
async function findUidInSchema(fieldParts, schema) {
    for (const field of schema) {
        if (field.uid === fieldParts[0]) {
            // If this is the last part of the field path, it's valid
            if (fieldParts.length === 1) return true;

            // If it's a group or global field, recursively check its schema
            if (field.data_type === 'group' || field.data_type === 'global_field') {
                return await findUidInSchema(fieldParts.slice(1), field.schema);
            }
        }
    }
    return false; // Field not found
}

// Main function to validate field rules and update schema
async function fixFieldValidityRule(schemaFilePath) {
    try {
        const fullPath = path.join(schemaFilePath,'content_types', 'schema.json');
        const data = await fs.readFile(fullPath, 'utf-8');
        console.log(fullPath);
        const schemaJson = JSON.parse(data);

        for (const ct of schemaJson) {
            if (ct?.field_rules) {
                ct.field_rules = (
                    await Promise.all(
                        ct.field_rules.map(async (fieldRule) => {
                            // Validate operand fields in conditions
                            const areConditionsValid = await Promise.all(
                                fieldRule.conditions.map(async (rule) => {
                                    const operandParts = rule.operand_field.split('.');
                                    const isOperandValid = await findUidInSchema(operandParts, ct.schema);
                                    if (!isOperandValid) {
                                        await log(`❌ Invalid operand field: ${rule.operand_field} in content type ${ct.uid}`);
                                    }
                                    return isOperandValid;
                                })
                            );

                            // Validate target fields in actions
                            const areTargetFieldsValid = await Promise.all(
                                fieldRule.actions.map(async (action) => {
                                    const targetParts = action.target_field.split('.');
                                    const isTargetValid = await findUidInSchema(targetParts, ct.schema);
                                    if (!isTargetValid) {
                                        await log(`❌ Invalid target field: ${action.target_field} in content type ${ct.uid}`);
                                    }
                                    return isTargetValid;
                                })
                            );

                            await log(`✅ Conditions valid for ${ct.uid}: ${areConditionsValid}`);
                            await log(`✅ Target fields valid for ${ct.uid}: ${areTargetFieldsValid}`);

                            return areConditionsValid.every(Boolean) && areTargetFieldsValid.every(Boolean)
                                ? fieldRule
                                : null;
                        })
                    )
                ).filter(rule => rule !== null);

                await log(`✅ Updated field rules for content type: ${ct.uid}`);
            }
        }


        // Write updated schema to the original file
        await fs.writeFile(fullPath, JSON.stringify(schemaJson, null, 2), 'utf-8');
        await log(`✅ Updated schema written to ${fullPath}`);
        console.log(`✅ Updated schema written to ${fullPath}`);
        

    } catch (err) {
        await log(`❌ Error while processing schema file: ${err.message}`);
        console.error(err);
    }
}


module.exports = fixFieldValidityRule;
