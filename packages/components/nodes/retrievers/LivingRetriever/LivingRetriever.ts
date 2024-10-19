import { ICommonObject, INode, INodeData, INodeOutputsValue, INodeParams } from '../../../src/Interface'
import { handleEscapeCharacters } from '../../../src'
import { VectorStore } from '@langchain/core/vectorstores'

const defaultPrompt = `{question}`

class LivingRetriever_Retrievers implements INode {
    label: string
    name: string
    version: number
    description: string
    type: string
    icon: string
    category: string
    baseClasses: string[]
    inputs: INodeParams[]
    outputs: INodeOutputsValue[]

    constructor() {
        this.label = 'Living Retriever'
        this.name = 'livingRetriever'
        this.version = 1.2
        this.type = 'LivingRetriever'
        this.icon = 'LivingRetriever.svg'
        this.category = 'Retrievers'
        this.description = 'given user input query'
        this.baseClasses = [this.type, 'BaseRetriever']

        this.inputs = [
            {
                label: 'Vector Store',
                name: 'vectorStore',
                type: 'VectorStore'
            },
            {
                label: 'Prompt',
                name: 'modelPrompt',
                description: 'Use {question} to refer to the original question',
                type: 'string',
                rows: 4,
                default: defaultPrompt
            },
            {
                label: 'Meta Prompt',
                name: 'metaPrompt',
                description: 'Meta Prompt',
                type: 'string',
                rows: 4
            },
            {
                label: 'Format Prompt Values',
                name: 'promptValues',
                type: 'json',
                optional: true,
                acceptVariable: true,
                list: true
            },
            {
                label: 'Metadata filter',
                name: 'metadataFilter',
                type: 'json',
                optional: true,
                acceptVariable: true,
                list: true
            },
            {
                label: 'Top K',
                name: 'topK',
                description: 'Number of top results to fetch. Default to 4',
                placeholder: '4',
                type: 'number',
                additionalParams: true,
                optional: true
            }
        ]
        this.outputs = [
            {
                label: 'Document',
                name: 'document',
                description: 'Array of document objects containing metadata and pageContent',
                baseClasses: ['Document', 'json']
            },
            {
                label: 'Text',
                name: 'text',
                description: 'Concatenated string from pageContent of documents',
                baseClasses: ['string', 'json']
            }
        ]
    }

    metaConfig(data: any, meta: any) {
        for (let prop in meta) {
            if (typeof meta[prop] == 'string') {
                let value = data[(meta[prop] ?? '').replace(/^\{/, '').replace(/\}$/, '')] ?? null
                try {
                    value = JSON.parse(`${value}`)
                } catch (e) {
                    console.error(e)
                }
                meta[prop] = value
            } else {
                this.metaConfig(data, meta[prop])
            }
        }

        return meta
    }

    async init(nodeData: INodeData, input: string, options: ICommonObject): Promise<any> {
        const vectorStore = nodeData.inputs?.vectorStore as VectorStore
        const output = nodeData.outputs?.output as string
        const promptValuesStr = nodeData.inputs?.promptValues
        const topK = nodeData.inputs?.topK ?? 4
        let modelPrompt = (nodeData.inputs?.modelPrompt ?? '{question}') as string
        const metadataFilterStr = nodeData.inputs?.metadataFilter
        const metaPromptStr = nodeData.inputs?.metaPrompt

        let promptValues: ICommonObject = {}
        if (promptValuesStr) {
            try {
                promptValues = typeof promptValuesStr === 'object' ? promptValuesStr : JSON.parse(promptValuesStr)
            } catch (exception) {
                throw new Error("Invalid JSON in the LivingRetriver's's promptValues: " + exception)
            }
        }

        for (let prop in promptValues ?? {}) {
            modelPrompt = modelPrompt.replaceAll(`{${prop}}`, promptValues[prop])
        }

        let metadataFilter: ICommonObject = {}
        if (metadataFilterStr) {
            try {
                metadataFilter = typeof metadataFilterStr === 'object' ? metadataFilterStr : JSON.parse(metadataFilterStr)
            } catch (exception) {
                throw new Error("Invalid JSON in the LivingRetriver's's metadataFilter: " + exception)
            }
        }

        if (metaPromptStr) {
            try {
                let metaPrompt = typeof metaPromptStr === 'object' ? metaPromptStr : eval(`(${metaPromptStr})`)
                metadataFilter = this.metaConfig(metadataFilter, metaPrompt)
            } catch (exception) {
                throw new Error("Invalid JSON in the LivingRetriver's's metaPrompt: " + exception)
            }
        }

        if (output === 'document') {
            const docs = await vectorStore.similaritySearch(modelPrompt, topK, {
                metadata: metadataFilter
            })

            return docs
        } else if (output === 'text') {
            let finaltext = ''

            const docs = await vectorStore.similaritySearch(modelPrompt, topK, {
                metadata: metadataFilter
            })

            for (const doc of docs) finaltext += `${doc.pageContent}\n`

            return handleEscapeCharacters(finaltext, false)
        }
    }
}

module.exports = { nodeClass: LivingRetriever_Retrievers }
