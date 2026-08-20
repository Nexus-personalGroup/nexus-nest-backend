import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

export class IpListNotFoundException extends DomainException {
  constructor() {
    super(ResponseCodes.IP_LIST_NOT_FOUND, 'NOT_FOUND');
  }
}
