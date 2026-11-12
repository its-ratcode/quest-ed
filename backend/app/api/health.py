from flask_restx import Namespace, Resource

ns = Namespace("health", description="Is the API up?")


@ns.route("")
class Health(Resource):
    def get(self):
        """Answers {"status": "ok"} while the API is running."""
        return {"status": "ok"}
