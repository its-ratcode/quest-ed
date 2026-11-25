"""What the web app needs to know about this site, and the notices banner."""
from flask_jwt_extended import current_user, jwt_required
from flask_restx import Namespace, Resource

from ..services.site import get_features, needs_setup, notices_for

ns = Namespace("site", description="Site settings and notices")


@ns.route("/config")
class Config(Resource):
    def get(self):
        """Which site switches are on, and whether the site still needs its administrator.
        Public, so the sign-in and sign-up pages can check before anyone signs in."""
        return {"features": get_features(), "needs_setup": needs_setup()}


@ns.route("/notices")
class Notices(Resource):
    @jwt_required()
    def get(self):
        """The notices showing now for the signed-in person."""
        return {"items": [n.to_dict() for n in notices_for(current_user)]}
