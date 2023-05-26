/* eslint-disable no-console */
import * as core from '@actions/core'
import * as fs from 'fs'
import * as path from 'path'

import {GraphQLClient, gql} from 'graphql-request'

const endpoint: string = process.env.REVIEW_END_POINT || ''

interface EvaluationCriteria {
  id: string
  pass_grade: number
}

interface Submission {
  id: string
  target: {
    evaluation_criteria: EvaluationCriteria[]
  }
  checklist: JSON
}

interface ReportData {
  status: string
  grade: string
  feedback: string
}

interface GradeInput {
  evaluationCriterionId: string
  grade: number
}

const graphQLClient = new GraphQLClient(endpoint, {
  headers: {
    authorization: `Bearer ${process.env.REVIEW_BOT_USER_TOKEN}`
  }
})

const mutation = gql`
  mutation GradeSubmission(
    $submissionId: ID!
    $grades: [GradeInput!]!
    $checklist: JSON!
    $feedback: String
  ) {
    createGrading(
      submissionId: $submissionId
      grades: $grades
      checklist: $checklist
      feedback: $feedback
    ) {
      success
    }
  }
`

const readJSON = (filePath: string): any => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    console.error(`Failed to read or parse file at ${filePath}`, error)
    throw new Error(`Failed to read or parse file at ${filePath}`)
  }
}

const getGrades = (
  evaluationCriteria: EvaluationCriteria[],
  isPassed: boolean
) => {
  return evaluationCriteria.map(ec => ({
    evaluationCriterionId: ec.id,
    grade: isPassed ? ec.pass_grade : ec.pass_grade - 1
  }))
}

const reportFilePath: string = core.getInput('report_file_path')
const fail_submission: boolean = core.getBooleanInput('fail_submission')
const feedbackInput: string = core.getInput('feedback')
const testMode: boolean = core.getBooleanInput('test_mode')

const validStatuses: string[] = ['success', 'failure', 'error']
const validStatus = (status: string): boolean => validStatuses.includes(status)

const workspace = process.env.GITHUB_WORKSPACE || ''

let submissionData: Submission = readJSON(
  path.join(workspace, 'submission.json')
)

if (!(fail_submission || reportFilePath !== '')) {
  throw 'Either report file path should be provide or fail submission should be used'
}

const reportData: ReportData = fail_submission
  ? {}
  : readJSON(path.join(workspace, reportFilePath))

if (!fail_submission && !reportData) {
  throw 'Could not determine pass or fail status of the submission, Either report file path should be provide or fail submission should be used'
}

const skip: boolean = reportData?.grade === 'skip'

const grades = getGrades(
  submissionData.target.evaluation_criteria,
  reportData?.status === 'success'
)

const variables = {
  submissionId: submissionData.id,
  grades: grades,
  checklist: submissionData.checklist,
  feedback: reportData?.feedback || feedbackInput
}

export async function run(): Promise<void> {
  try {
    if (testMode) {
      console.log('variables: ', JSON.stringify(variables, undefined, 2))
    } else {
      if (fail_submission || (!skip && validStatus(reportData.status))) {
        const data = await graphQLClient.request(mutation, variables)
        console.log(JSON.stringify(data, undefined, 2))
      } else {
        console.log('Skipped grading')
      }
    }
  } catch (error) {
    console.log(error)
  }
}

run()
