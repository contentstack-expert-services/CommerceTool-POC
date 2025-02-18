import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import chalk from 'chalk';
import { desConfig } from './dest.config.js';

// Simple logger using console and file
const logFilePath = 'app.log';

const logger = {
    info: (message) => {
        const logMessage = `INFO: ${message}`;
        console.log(chalk.green(logMessage));
        fs.appendFileSync(logFilePath, logMessage + '\n');
    },
    error: (message) => {
        const logMessage = `ERROR: ${message}`;
        console.error(chalk.red(logMessage));
        fs.appendFileSync(logFilePath, logMessage + '\n');
    }
};

// Function to retrieve all entry objects from JSON files
function retrieveAllEntries(directoryPath, authTokens, apiUrl) {
    const entriesPath = path.join(directoryPath, 'entries');
    const allEntries = {};

    function processDirectory(dirPath) {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
                processDirectory(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('-entries.json')) {
                logger.info(`Processing file: ${entry.name}`);
                const fileEntries = processEntryFile(fullPath, authTokens, apiUrl);
                Object.assign(allEntries, fileEntries);
            }
        }
    }

    // New helper function to process a single entry
    async function processEntry(entry, entryID, authTokens, apiUrl, filePath, entryMap) {
        if (entry?.category?.data?.length) {
            const results = await Promise.all(entry.category.data.map(async (category) => {
                return await processCategoryData(
                    category, 
                    authTokens.category, 
                    apiUrl, 
                    desConfig.projectKey, 
                    entryID, 
                    filePath, 
                    entryMap
                );
            }));
            
            // Filter out null results and update the data array
            entry.category.data = entry.category.data.filter((_, index) => results[index] !== null);
            
            // If no valid categories remain, delete the category object
            if (entry.category.data.length === 0) {
                entry.category = {};
            }
        }

        if (entry?.product?.data?.length) {
            const results = await Promise.all(entry.product.data.map(async (product) => {
                return await processProductData(
                    product, 
                    authTokens.product, 
                    apiUrl, 
                    desConfig.projectKey, 
                    entryID, 
                    filePath, 
                    entryMap
                );
            }));
            
            // Filter out null results and update the data array
            entry.product.data = entry.product.data.filter((_, index) => results[index] !== null);
            
            // If no valid products remain, delete the product object
            if (entry.product.data.length === 0) {
                entry.product = {};
            }
        }
        
        return entryMap;
    }

    // Simplified processEntryFile function
    async function processEntryFile(filePath, authTokens, apiUrl) {
        try {
            const rawData = fs.readFileSync(filePath, 'utf8');
            const jsonData = JSON.parse(rawData);
            let entryMap = {};

            for await (const entryID of Object.keys(jsonData)) {
                entryMap = await processEntry(jsonData[entryID], entryID, authTokens, apiUrl, filePath, entryMap);
                
                // Check if both category and product are empty and empty publish_details if so
                if (Object.keys(jsonData[entryID].category || {}).length === 0 && Object.keys(jsonData[entryID].product || {}).length === 0) {
                    jsonData[entryID].publish_details = [];
                }
            }

            fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
            logger.info(`Entry Map: ${JSON.stringify(entryMap)}`);
            
            return entryMap;
        } catch (error) {
            logger.error(`Error processing ${path.basename(filePath)}: ${error.message}`);
            return {};
        }
    }

    processDirectory(entriesPath);

    // Log all updated entries at the end
    if (Object.keys(allEntries).length > 0) {
        logger.info(`All updated entries: ${JSON.stringify(allEntries)}`);
    }

    return allEntries;
}

// Simplified processCategoryData function to handle a single category
async function processCategoryData(category, authToken, apiUrl, projectKey, entryID, filePath, entryMap) {
    logger.info(`Processing category for Entry ID: ${entryID}`);
    if (!category || !category.key) {
        logger.error(`Error: ${path.basename(filePath)} - Entry ID: ${entryID} - Invalid or missing category data`);
        return entryMap;
    }

    const categoryKey = category.key;

    try {
        const newCategoryId = await getCategoryId(authToken, apiUrl, categoryKey, projectKey);
        if (newCategoryId) {
            category.id = newCategoryId; // Replace ID
            entryMap[entryID] = { ...entryMap[entryID], categoryKey };
            return entryMap;
        } else {
            logger.error(`Category key "${categoryKey}" not found for Entry ID: ${entryID}, removing it`);
            return null; // Return null to indicate this category should be removed
        }
    } catch (error) {
        logger.error(`Exception while processing category key "${categoryKey}": ${error.message}`);
        return null;
    }
}

// Helper function to process product data
async function processProductData(product, authToken, apiUrl, projectKey, entryID, filePath, entryMap) {
    logger.info(`Processing product for Entry ID: ${entryID}`);
    if (!product || !product.key) {
        logger.error(`Error: ${path.basename(filePath)} - Entry ID: ${entryID} - Invalid or missing product data`);
        return null;
    }

    const productKey = product.key;
    try {
        const newProductId = await getProductId(authToken, apiUrl, productKey, projectKey);
        if (newProductId) {
            product.id = newProductId;
            entryMap[entryID] = { ...entryMap[entryID], productKey };
            return entryMap;
        } else {
            logger.error(`Product key "${productKey}" not found for Entry ID: ${entryID}, removing it`);
            return null; // Return null to indicate this product should be removed
        }
    } catch (error) {
        logger.error(`Exception while processing product key "${productKey}": ${error.message}`);
        return null;
    }
}

// Function to fetch new category ID using the key
async function getCategoryId(authToken, apiUrl, key, projectKey) {
    const url = `${apiUrl}/${projectKey}/categories/key=${key}`;
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.status === 404) {
        logger.error(`Category not found for key "${key}". HTTP Status: 404`);
        return null;
    }

    if (!response.ok) {
        logger.error(`Failed to fetch category for key "${key}". HTTP Status: ${response.status}`);
        return null;
    }

    const data = await response.json();
    return data?.id || null;
}

// Function to fetch new product ID using the key
async function getProductId(authToken, apiUrl, key, projectKey) {
    const url = `${apiUrl}/${projectKey}/products/key=${key}`;
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.status === 404) {
        logger.error(`Product not found for key "${key}". HTTP Status: 404`);
        return null;
    }

    if (!response.ok) {
        logger.error(`Failed to fetch product for key "${key}". HTTP Status: ${response.status}`);
        return null;
    }

    const data = await response.json();
    return data?.id || null;
}

// Example usage
const userPath = desConfig.ExportedDataPath; // Updated to use desConfig.ExportedDataPath

(async () => {
    try {
        console.log('Starting the process...');
        
        // Get auth token for categories
        const categoryAuthToken = await getAuthToken(desConfig.clientId, desConfig.clientSecret, desConfig.authUrl, 'view_categories:cms-95');
        console.log('Category auth token retrieved:', categoryAuthToken);
        
        // Get auth token for products
        const productAuthToken = await getAuthToken(desConfig.clientId, desConfig.clientSecret, desConfig.authUrl, 'view_products:cms-95');
        console.log('Product auth token retrieved:', productAuthToken);
        
        const entries = await retrieveAllEntries(userPath, { category: categoryAuthToken, product: productAuthToken }, desConfig.apiUrl);
        logger.info('Updated entries:', entries);
        
        console.log('Process completed successfully.');
    } catch (error) {
        logger.error('Error:', error);
        console.error('Error occurred:', error); // Additional console log for debugging
    }
})();

// Function to obtain User Auth Token using Client Credentials
async function getAuthToken(clientId, clientSecret, authUrl, scope) {
    const response = await fetch(authUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
        },
        body: new URLSearchParams({
            'grant_type': 'client_credentials',
            'scope': scope
        })
    });

    const data = await response.json();
    if (!data.access_token) {
        logger.error('Failed to retrieve access token');
        throw new Error('Failed to retrieve access token');
    }
    return data.access_token;
}
