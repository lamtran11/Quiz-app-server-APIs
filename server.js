/* 1. check the second endpoint, the response must contain the question arr 
// 2. (second endpoint) the request is the format:
        {
            userAnswers: { 
                'questionId': "index", 
                'questionId2': "index", 
                ...
            }
        }

        NOT 
        {
            'questionId1': "index", 
            'questionId2': "index", 
            ...
        }

        make sure you get the userAnswers object right 
*/
const express = require('express')
const mongo = require('mongodb')
const app = express()
const rawData = require('./data')
const Attempt = require('./model/Attempt')
const cors = require("cors")

app.use(express.json())
app.use(cors())

const DB_NAME = "wpr-quiz";
const DB_URL = `mongodb://localhost:27017/${DB_NAME}`

let client = null;
let db = null;

async function startServer() {
    client = await mongo.MongoClient.connect(DB_URL)
    db = client.db()

    // save all questions into the database
    for (const data of rawData.questions) {
        const question = {
            answers: data.answers,
            text: data.text,
            correctAnswer: data.correctAnswer.$numberInt
        }

        const query = question;
        const update = { $set: question }
        const options = { upsert: true }
        await db.collection("questions").updateOne(query, update, options)

    }

}
startServer()

app.post("/attempts", async (req, res) => {

    // get 10 random questions
    const questionList = await db.collection("questions").find().toArray();
    const selectedQuestions = selectRandom10Questions(questionList);

    // create an attempt
    const attempt = new Attempt(selectedQuestions)
    // save the attempt to the db
    db.collection("attempts").insertOne(attempt)

    // send the attempt to client
    const reposnse = createResponse(attempt)
    res.json(reposnse)
    // save attempt to db 
    // send to user
})

function createResponse(attempt) {
    const questionWithoutAnswers = []

    // ignore all the correctAnswer keys in questions
    for (const question of attempt.questions) {
        const questionWithoutAnswer = {
            _id: question._id,
            answers: question.answers,
            text: question.text,
        }

        questionWithoutAnswers.push(questionWithoutAnswer)
    }

    const response = {
        _id: attempt._id,
        questions: questionWithoutAnswers,
        startedAt: attempt.createdAt,
        completed: attempt.completed,
    }

    return response
}

function selectRandom10Questions(questionList) {
    const listOf10Questions = []
    for (let i = 0; i < 10; i++) {
        const randomIndex = Math.floor(Math.random() * questionList.length)
        listOf10Questions.push(questionList[randomIndex])
    }

    return listOf10Questions
}

app.post("/attempts/:id/submit", async (req, res) => {
    const attemptId = req.params.id
    const userSubmit = req.body

    const userAnswers = userSubmit.userAnswers;

    const attempt = await db.collection("attempts").findOne({ _id: new mongo.ObjectId(attemptId) })

    let score = 0;
    // get all correct answers from the questions
    const correctAnswers = getAllCorrectAnswers(attempt.questions)

    if (!attempt.completed) {
        // grade the user answers
        for (const questionId of Object.keys(userAnswers)) {

            const userAnswer = userAnswers[questionId]
            const correctAnswer = correctAnswers[questionId]

            if (userAnswer == correctAnswer) {
                score++
            }
        }

        const filter = {_id: new mongo.ObjectId(attemptId)}
        const update = {$set: {complete: true}}
        await db.collection("attempts").updateOne(filter, update)
    }

    // set the score text
    let scoreText = "Practice more to improve it :D";
    if (score >= 9) {
        scoreText = "Perfect"
    } else if (score >= 7) {
        scoreText = "Well done!"
    } else if (score >= 5) {
        scoreText = "Good, Keep up!"
    }

    const response = {
        _id: attemptId,
        questions: createResponse(attempt).questions,
        startedAt: attempt.startedAt,
        userAnswers: userAnswers,
        correctAnswers: correctAnswers,
        score: score,
        scoreText: scoreText,
        completed: true
    }

    res.json(response)
})

function getAllCorrectAnswers(questions) {
    const correctAnwers = {}

    for (const question of questions) {
        correctAnwers[question._id.toString()] = question.correctAnswer
    }

    return correctAnwers
}

app.listen(3000, () => {
    console.log("app is listening on port 3000");
})