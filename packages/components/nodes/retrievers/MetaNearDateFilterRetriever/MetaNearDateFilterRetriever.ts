import { ICommonObject, INode, INodeData, INodeOutputsValue, INodeParams } from '../../../src/Interface'
import { handleEscapeCharacters } from '../../../src'
import { BaseLanguageModel } from '@langchain/core/language_models/base'

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
        this.label = 'Meta Near Date Filter Retriever'
        this.name = 'metaNearDateFilterRetriever'
        this.version = 1.3
        this.type = 'MetaNearDateFilterRetriever'
        this.icon = 'MetaNearDateFilterRetriever.svg'
        this.category = 'Retrievers'
        this.description = 'metadata filter near date'
        this.baseClasses = [this.type, 'BaseRetriever']

        this.inputs = [
            {
                label: 'Language Model',
                name: 'model',
                type: 'BaseLanguageModel'
            },
            {
                label: 'Prompt',
                name: 'modelPrompt',
                description: 'Prompt',
                type: 'string',
                rows: 4,
                default: defaultPrompt
            },
            {
                label: 'Format Prompt Values',
                name: 'promptValues',
                type: 'json',
                acceptVariable: true,
                list: true
            },
            {
                label: 'Meta Prompt',
                name: 'metaPrompt',
                type: 'string',
                rows: 4
            },
            {
                label: 'Data Values',
                name: 'dataValues',
                type: 'json',
                acceptVariable: true,
                list: true
            },
            {
                label: 'Top K to Current Data',
                name: 'topKCurrent',
                description: 'Number of top results to fetch. Default to 20',
                placeholder: '20',
                type: 'number',
                additionalParams: true,
                optional: true
            },
            {
                label: 'Top K',
                name: 'topK',
                description: 'Number of top results to fetch. Default to 20',
                placeholder: '20',
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
                    let error = e
                }
                meta[prop] = value
            } else {
                this.metaConfig(data, meta[prop])
            }
        }

        return meta
    }

    async init(nodeData: INodeData, input: string, options: ICommonObject): Promise<any> {
        const output = nodeData.outputs?.output as string
        const dataValuesStr = nodeData.inputs?.dataValues
        const topK = parseInt(nodeData.inputs?.topK ? nodeData.inputs?.topK : 20)
        const topKCurrent = parseInt(nodeData.inputs?.topKCurrent ? nodeData.inputs?.topK : 20)
        const metaPrompt = nodeData.inputs?.metaPrompt
        const promptValuesStr = nodeData.inputs?.promptValues
        const model = nodeData.inputs?.model as BaseLanguageModel
        let modelPrompt = {
            value: nodeData.inputs?.modelPrompt
        }

        let promptValues: ICommonObject = {}
        if (promptValuesStr) {
            try {
                promptValues = typeof promptValuesStr === 'object' ? promptValuesStr : JSON.parse(promptValuesStr)
            } catch (exception) {
                throw new Error("Invalid JSON in the LivingRetriver's's promptValues: " + exception)
            }
        }

        let dataValues: ICommonObject = []
        if (dataValuesStr) {
            try {
                dataValues = Array.isArray(dataValuesStr) ? dataValuesStr : JSON.parse(dataValuesStr)
                for (let prop in dataValues) {
                    dataValues = Array.isArray(dataValues[prop]) ? dataValues[prop] : JSON.parse(dataValues[prop])
                    break
                }
            } catch (exception) {
                throw new Error("Invalid JSON in the MetaNearDateFilterRetriever's's dataValues: " + exception)
            }
        }

        if (!model) throw new Error('There must be a LLM model connected to MetaNearDateFilterRetriever')

        if (!Array.isArray(dataValues)) {
            throw new Error("Invalid JSON in the MetaNearDateFilterRetriever's no array")
        }

        let dataToFilter: string[] = []

        try {
            dataToFilter = dataValues
                .map((x) => {
                    try {
                        return eval(`x.${metaPrompt}`)
                    } catch (e) {
                        console.error(e)
                    }
                })
                .filter((x) => x && typeof x === 'string')
        } catch (exception) {
            throw new Error("Invalid JSON in the MetaNearDateFilterRetriever's metaPrompt: " + exception)
        }

        let tmp: string[] = []

        dataToFilter.forEach((x) => {
            if (tmp.indexOf(x) < 0) {
                tmp.push(x)
            }
        })
        dataToFilter = tmp

        promptValues.files = JSON.stringify(dataToFilter).replace('[', '').replace(']', '')

        for (let prop in promptValues ?? {}) {
            modelPrompt.value = modelPrompt.value.replaceAll(`{${prop}}`, promptValues[prop])
        }

        let response = await model.invoke(modelPrompt.value)

        let text = (response.content ?? '').substring((response.content ?? '').indexOf('['))
        text = text.substring(0, text.lastIndexOf(']') + 1)

        let filter: ICommonObject = []
        if (dataValuesStr) {
            try {
                filter = JSON.parse(text)
            } catch (exception) {
                console.error(exception)
            }
        }

        if (!Array.isArray(filter)) {
            throw new Error("Invalid filter the MetaNearDateFilterRetriever's no array")
        }

        let docs: any[] = []

        if (filter.length > 0) {
            console.info('>>>> Filtrado pelos dados mais atuais >>>>')
            filter
                .filter((x) => x && typeof x === 'string')
                .forEach((f) => {
                    let key = `x.${metaPrompt}`
                    let found = dataValues
                        .filter((x) => {
                            try {
                                let name = eval(key)
                                return name == f
                            } catch (e) {
                                console.error(e)
                            }
                        })
                        .filter((x) => x)
                    for (let item of found) {
                        if (docs.length < topKCurrent) {
                            docs.push(item)
                        } else {
                            break
                        }
                    }
                })
        } else {
            for (let item of dataValues) {
                if (docs.length < topK) {
                    docs.push(item)
                } else {
                    break
                }
            }
        }

        if (output === 'document') {
            return docs
        } else if (output === 'text') {
            let finaltext = ''
            for (const doc of docs) finaltext += `${doc.pageContent}\n`
            return handleEscapeCharacters(finaltext, false)
        }
    }
}

module.exports = { nodeClass: LivingRetriever_Retrievers }
