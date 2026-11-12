"""Every API route lives under /api/v1, one namespace per area."""
from flask import Blueprint
from flask_restx import Api


def create_api_blueprint(enable_docs=True):
    blueprint = Blueprint("api", __name__, url_prefix="/api/v1")
    api = Api(
        blueprint,
        title="Quest-Ed API",
        version="1.0",
        description="Tasks, approvals, points and rewards for families.",
        doc="/docs" if enable_docs else False,
    )

    from .health import ns as health_ns

    api.add_namespace(health_ns, path="/health")
    return blueprint
